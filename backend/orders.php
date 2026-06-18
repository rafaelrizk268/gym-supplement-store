<?php
header("Content-Type: application/json");
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/vat.php';
require_once __DIR__ . '/mailer.php';

/** Allowed order status values (whitelist — prevents arbitrary string writes). */
const ALLOWED_ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

// ── GET: single order's items ─────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['order_id'])) {
    $order_id = (int) $_GET['order_id'];
    try {
        $stmt = $pdo->prepare(
            "SELECT product_name, price, quantity FROM order_items WHERE order_id = ?"
        );
        $stmt->execute([$order_id]);
        echo json_encode(['success' => true, 'items' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
    exit;
}

// ── GET: all orders ───────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM orders");
        echo json_encode(['success' => true, 'orders' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
    exit;
}

// ── POST: create order ────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true) ?? [];

    // Required top-level fields
    $required = ['customer_name', 'customer_email', 'phone',
                 'street_address', 'city', 'state', 'zip', 'country',
                 'shipping_method', 'payment_method', 'cart'];
    foreach ($required as $field) {
        if (empty($data[$field])) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => "Missing required field: $field"]);
            exit;
        }
    }
    if (!is_array($data['cart']) || count($data['cart']) === 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Cart is empty']);
        exit;
    }
    if (!filter_var($data['customer_email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Invalid email address']);
        exit;
    }

    try {
        // Compute totals server-side (never trust the client for money values)
        $subtotal = 0.0;
        foreach ($data['cart'] as $item) {
            $subtotal += (float) ($item['price'] ?? 0) * (int) ($item['qty'] ?? 0);
        }
        $tax         = round($subtotal * current_tax_rate($pdo) * 100) / 100;
        $shippingFee = round((float) ($data['shipping_fee'] ?? 0.0) * 100) / 100;
        $total       = round(($subtotal + $tax + $shippingFee) * 100) / 100;
        $tracking   = trim((string) ($data['tracking_number'] ?? ''));
        $tracking   = $tracking === '' ? null : $tracking;

        $rawPaypalId  = trim((string) ($data['paypal_order_id'] ?? ''));
        $paypalOrderId = $rawPaypalId === '' ? null : $rawPaypalId;

        $stmt = $pdo->prepare("
            INSERT INTO orders (
                customer_name, customer_email, phone,
                street_address, city, state, zip, country,
                shipping_method, payment_method, cardholder_name,
                total, tax, shipping_fee, tracking_number,
                paypal_order_id,
                status, location, latitude, longitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            trim((string) $data['customer_name']),
            trim((string) $data['customer_email']),
            trim((string) ($data['phone'] ?? '')),
            trim((string) $data['street_address']),
            trim((string) $data['city']),
            trim((string) $data['state']),
            trim((string) $data['zip']),
            trim((string) $data['country']),
            trim((string) $data['shipping_method']),
            trim((string) $data['payment_method']),
            trim((string) ($data['cardholder_name'] ?? '')),
            $total,
            $tax,
            $shippingFee,
            $tracking,
            $paypalOrderId,
            'pending',
            trim((string) ($data['location'] ?? '')),
            isset($data['latitude'])  ? (float) $data['latitude']  : null,
            isset($data['longitude']) ? (float) $data['longitude'] : null,
        ]);
        $order_id = (int) $pdo->lastInsertId();

        // Insert line items
        $itemStmt = $pdo->prepare(
            "INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
             VALUES (?, ?, ?, ?, ?)"
        );
        foreach ($data['cart'] as $item) {
            $itemStmt->execute([
                $order_id,
                (int)   $item['id'],
                trim((string) $item['name']),
                (float) $item['price'],
                (int)   $item['qty'],
            ]);
        }

        // Send confirmation + admin notification emails (failures are logged, never fatal)
        try {
            send_order_emails($order_id, [
                'customer_name'   => trim((string) $data['customer_name']),
                'customer_email'  => trim((string) $data['customer_email']),
                'phone'           => trim((string) ($data['phone']           ?? '')),
                'street_address'  => trim((string) $data['street_address']),
                'city'            => trim((string) $data['city']),
                'state'           => trim((string) $data['state']),
                'zip'             => trim((string) $data['zip']),
                'country'         => trim((string) $data['country']),
                'shipping_method' => trim((string) $data['shipping_method']),
                'payment_method'  => trim((string) $data['payment_method']),
                'subtotal'        => $subtotal,
                'tax'             => $tax,
                'shipping_fee'    => $shippingFee,
                'total'           => $total,
            ], $data['cart']);
        } catch (\Throwable $e) {
            error_log("[Mailer] Unexpected error for order #{$order_id}: " . $e->getMessage());
        }

        echo json_encode(['success' => true, 'order_id' => $order_id]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
    exit;
}

// ── PUT: update order status ──────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $data = json_decode(file_get_contents("php://input"), true) ?? [];

    $id     = (int) ($data['id']     ?? 0);
    $status = trim((string) ($data['status'] ?? ''));

    if ($id <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Invalid order id']);
        exit;
    }
    if (!in_array($status, ALLOWED_ORDER_STATUSES, true)) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'error'   => 'Invalid status. Allowed: ' . implode(', ', ALLOWED_ORDER_STATUSES),
        ]);
        exit;
    }

    try {
        $stmt = $pdo->prepare("UPDATE orders SET status=? WHERE id=?");
        $stmt->execute([$status, $id]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
    exit;
}

// ── DELETE: remove order ──────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    $id   = (int) ($data['id'] ?? 0);

    if ($id <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Invalid order id']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM orders WHERE id=?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
