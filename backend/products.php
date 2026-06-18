<?php
header('Content-Type: application/json');
require_once 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$uri    = $_SERVER['REQUEST_URI'];

// ── helpers ──────────────────────────────────────────────────────────────────

function require_fields(array $data, array $fields): void {
    foreach ($fields as $f) {
        if (!isset($data[$f]) || (string) $data[$f] === '') {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => "Missing required field: $f"]);
            exit;
        }
    }
}

// ── handlers ─────────────────────────────────────────────────────────────────

function getProducts(PDO $pdo): void {
    $stmt = $pdo->query('SELECT * FROM products');
    echo json_encode(['success' => true, 'products' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function getFeaturedProducts(PDO $pdo): void {
    $stmt = $pdo->prepare('SELECT * FROM products WHERE featured = 1');
    $stmt->execute();
    echo json_encode(['success' => true, 'products' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function addProduct(PDO $pdo): void {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    require_fields($data, ['name', 'description', 'price', 'image']);

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO products (name, description, price, image, featured, `usage`) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            trim((string) $data['name']),
            trim((string) $data['description']),
            (float) $data['price'],
            trim((string) $data['image']),
            isset($data['featured']) ? (int) (bool) $data['featured'] : 0,
            isset($data['usage'])    ? trim((string) $data['usage'])   : null,
        ]);
        echo json_encode(['success' => true, 'id' => (int) $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function updateProduct(PDO $pdo, int $id): void {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    require_fields($data, ['name', 'description', 'price', 'image']);

    try {
        $stmt = $pdo->prepare(
            'UPDATE products SET name=?, description=?, price=?, image=?, featured=?, `usage`=? WHERE id=?'
        );
        $stmt->execute([
            trim((string) $data['name']),
            trim((string) $data['description']),
            (float) $data['price'],
            trim((string) $data['image']),
            isset($data['featured']) ? (int) (bool) $data['featured'] : 0,
            isset($data['usage'])    ? trim((string) $data['usage'])   : null,
            $id,
        ]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

function deleteProduct(PDO $pdo, int $id): void {
    try {
        $stmt = $pdo->prepare('DELETE FROM products WHERE id=?');
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Database error']);
    }
}

// ── routing ───────────────────────────────────────────────────────────────────

if (preg_match('#/backend/products\.php/featured#', $uri) && $method === 'GET') {
    getFeaturedProducts($pdo); exit;
}
if (preg_match('#/backend/products\.php$#', $uri) && $method === 'GET') {
    getProducts($pdo); exit;
}
if (preg_match('#/backend/products\.php$#', $uri) && $method === 'POST') {
    addProduct($pdo); exit;
}
if (preg_match('#/backend/products\.php/(\d+)#', $uri, $m) && $method === 'PUT') {
    updateProduct($pdo, (int) $m[1]); exit;
}
if (preg_match('#/backend/products\.php/(\d+)#', $uri, $m) && $method === 'DELETE') {
    deleteProduct($pdo, (int) $m[1]); exit;
}

http_response_code(404);
echo json_encode(['success' => false, 'error' => 'Invalid endpoint or method']);
