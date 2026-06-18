<?php
/**
 * Order email notifications using PHPMailer over SMTP.
 *
 * Sends two emails on every new order:
 *   1. Customer confirmation — order summary + shipping address
 *   2. Admin alert           — full order details + customer contact
 *
 * Install PHPMailer once:
 *   composer install          (if vendor/ doesn't exist yet)
 *
 * All SMTP credentials are read from .env — never hard-code them here.
 * Any mail failure is logged silently; it will never abort the order save.
 */

/**
 * Entry point called from orders.php after a successful DB insert.
 *
 * @param int   $orderId  The newly created order's primary key.
 * @param array $order    Scalar order fields: customer info, totals, methods.
 * @param array $cart     Cart items from the request: [{name, price, qty}, …]
 */
function send_order_emails(int $orderId, array $order, array $cart): void
{
    // Guard: require Composer autoloader (PHPMailer)
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (!file_exists($autoload)) {
        error_log('[Mailer] PHPMailer not installed. Run: composer install');
        return;
    }
    require_once $autoload;

    // ── SMTP config from .env ─────────────────────────────────────────────────
    $host      = $_ENV['MAIL_HOST']         ?? '';
    $port      = (int)($_ENV['MAIL_PORT']   ?? 587);
    $username  = $_ENV['MAIL_USERNAME']     ?? '';
    $password  = $_ENV['MAIL_PASSWORD']     ?? '';
    $enc       = strtolower($_ENV['MAIL_ENCRYPTION']    ?? 'tls');
    $fromAddr  = $_ENV['MAIL_FROM_ADDRESS'] ?? $username;
    $fromName  = $_ENV['MAIL_FROM_NAME']    ?? 'GymSupps Store';
    $adminTo   = $_ENV['MAIL_ADMIN_TO']     ?? '';

    if ($host === '' || $username === '' || $password === '') {
        error_log("[Mailer] SMTP not configured — skipping emails for order #{$orderId}");
        return;
    }

    // ── shared HTML building blocks ───────────────────────────────────────────
    $itemsHtml  = _mailer_items_table($cart);
    $totalsHtml = _mailer_totals_table($order);
    $date       = date('F j, Y \a\t g:i A');

    // Factory: returns a fresh, pre-configured PHPMailer instance
    $makeMailer = static function () use (
        $host, $port, $enc, $username, $password, $fromAddr, $fromName
    ): \PHPMailer\PHPMailer\PHPMailer {
        $mail             = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = $host;
        $mail->SMTPAuth   = true;
        $mail->Username   = $username;
        $mail->Password   = $password;
        $mail->SMTPSecure = ($enc === 'ssl')
            ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
            : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $port;
        $mail->CharSet    = 'UTF-8';
        $mail->setFrom($fromAddr, $fromName);
        $mail->isHTML(true);
        return $mail;
    };

    // ── 1. Customer confirmation ──────────────────────────────────────────────
    try {
        $mail = $makeMailer();
        $mail->addAddress($order['customer_email'], $order['customer_name']);
        $mail->Subject = "Order Confirmation #{$orderId} – {$fromName}";
        $mail->Body    = _mailer_customer_html($orderId, $order, $itemsHtml, $totalsHtml, $fromName, $date);
        $mail->AltBody = _mailer_customer_text($orderId, $order, $cart);
        $mail->send();
        error_log("[Mailer] Confirmation sent to {$order['customer_email']} for order #{$orderId}");
    } catch (\Throwable $e) {
        error_log("[Mailer] Customer email failed for order #{$orderId}: " . $e->getMessage());
    }

    // ── 2. Admin notification ─────────────────────────────────────────────────
    if ($adminTo !== '') {
        try {
            $mail = $makeMailer();
            $mail->addAddress($adminTo);
            $mail->Subject = "New Order #{$orderId} from {$order['customer_name']}";
            $mail->Body    = _mailer_admin_html($orderId, $order, $itemsHtml, $totalsHtml, $date);
            $mail->AltBody = _mailer_admin_text($orderId, $order, $cart);
            $mail->send();
            error_log("[Mailer] Admin notification sent for order #{$orderId}");
        } catch (\Throwable $e) {
            error_log("[Mailer] Admin email failed for order #{$orderId}: " . $e->getMessage());
        }
    }
}

// ── Private HTML/text helpers (prefixed to avoid global namespace clashes) ────

function _mailer_items_table(array $cart): string
{
    $rows = '';
    foreach ($cart as $item) {
        $name  = htmlspecialchars((string)($item['name']  ?? ''), ENT_QUOTES, 'UTF-8');
        $qty   = (int)($item['qty']   ?? 0);
        $price = (float)($item['price'] ?? 0);
        $line  = $qty * $price;
        $rows .= "
          <tr>
            <td style='padding:9px 12px;border-bottom:1px solid #eee;'>{$name}</td>
            <td style='padding:9px 12px;border-bottom:1px solid #eee;text-align:center;'>{$qty}</td>
            <td style='padding:9px 12px;border-bottom:1px solid #eee;text-align:right;'>\$"
            . number_format($price, 2) . "</td>
            <td style='padding:9px 12px;border-bottom:1px solid #eee;text-align:right;'>\$"
            . number_format($line,  2) . "</td>
          </tr>";
    }
    return "
    <table width='100%' cellpadding='0' cellspacing='0'
           style='border-collapse:collapse;border:1px solid #eee;margin:16px 0;font-size:14px;'>
      <thead>
        <tr style='background:#f8f8f8;'>
          <th style='padding:9px 12px;text-align:left;border-bottom:2px solid #ddd;'>Product</th>
          <th style='padding:9px 12px;text-align:center;border-bottom:2px solid #ddd;'>Qty</th>
          <th style='padding:9px 12px;text-align:right;border-bottom:2px solid #ddd;'>Unit</th>
          <th style='padding:9px 12px;text-align:right;border-bottom:2px solid #ddd;'>Total</th>
        </tr>
      </thead>
      <tbody>{$rows}</tbody>
    </table>";
}

function _mailer_totals_table(array $order): string
{
    $sub  = number_format((float)($order['subtotal']     ?? 0), 2);
    $tax  = number_format((float)($order['tax']          ?? 0), 2);
    $ship = number_format((float)($order['shipping_fee'] ?? 0), 2);
    $tot  = number_format((float)($order['total']        ?? 0), 2);
    return "
    <table cellpadding='0' cellspacing='0' align='right'
           style='font-size:14px;margin-bottom:16px;'>
      <tr>
        <td style='padding:4px 24px 4px 0;color:#555;'>Subtotal</td>
        <td style='text-align:right;'>\${$sub}</td>
      </tr>
      <tr>
        <td style='padding:4px 24px 4px 0;color:#555;'>Tax</td>
        <td style='text-align:right;'>\${$tax}</td>
      </tr>
      <tr>
        <td style='padding:4px 24px 4px 0;color:#555;'>Shipping</td>
        <td style='text-align:right;'>\${$ship}</td>
      </tr>
      <tr>
        <td style='padding:10px 24px 4px 0;font-weight:bold;font-size:15px;
                   border-top:2px solid #333;'>Grand Total</td>
        <td style='text-align:right;font-weight:bold;font-size:15px;
                   border-top:2px solid #333;'>\${$tot}</td>
      </tr>
    </table>
    <div style='clear:both;'></div>";
}

/** Wraps any email body in a consistent branded shell. */
function _mailer_layout(string $heading, string $body, string $storeName): string
{
    $year = date('Y');
    return "<!DOCTYPE html>
<html lang='en'>
<head><meta charset='UTF-8'><meta name='viewport' content='width=device-width'></head>
<body style='margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;
             color:#333;font-size:15px;line-height:1.5;'>
  <table width='100%' cellpadding='0' cellspacing='0' role='presentation'>
    <tr><td align='center' style='padding:32px 16px;'>
      <table width='600' cellpadding='0' cellspacing='0' role='presentation'
             style='background:#fff;border-radius:8px;overflow:hidden;
                    box-shadow:0 2px 12px rgba(0,0,0,.1);max-width:100%;'>

        <!-- Header -->
        <tr>
          <td style='background:#1a1a2e;padding:24px 32px;'>
            <h1 style='margin:0;color:#fff;font-size:22px;letter-spacing:.5px;'>
              {$storeName}
            </h1>
          </td>
        </tr>

        <!-- Sub-heading -->
        <tr>
          <td style='background:#e8e0ff;padding:14px 32px;'>
            <h2 style='margin:0;font-size:16px;color:#1a1a2e;'>{$heading}</h2>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style='padding:32px;'>{$body}</td></tr>

        <!-- Footer -->
        <tr>
          <td style='background:#f8f8f8;padding:16px 32px;text-align:center;
                     font-size:12px;color:#999;border-top:1px solid #eee;'>
            &copy; {$year} {$storeName}. All rights reserved.
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>";
}

function _mailer_customer_html(
    int $orderId, array $order,
    string $itemsHtml, string $totalsHtml,
    string $storeName, string $date
): string {
    $name    = htmlspecialchars($order['customer_name'],   ENT_QUOTES, 'UTF-8');
    $addr    = htmlspecialchars(
        "{$order['street_address']}, {$order['city']}, {$order['state']} {$order['zip']}, {$order['country']}",
        ENT_QUOTES, 'UTF-8'
    );
    $ship    = htmlspecialchars(ucfirst($order['shipping_method'] ?? ''), ENT_QUOTES, 'UTF-8');
    $payment = htmlspecialchars(ucfirst($order['payment_method']  ?? ''), ENT_QUOTES, 'UTF-8');

    $body = "
    <p style='margin-top:0;'>Hi <strong>{$name}</strong>,</p>
    <p>Thank you for your order! We received it on <strong>{$date}</strong>
       and are already getting it ready.</p>
    <p>Your order number is <strong style='font-size:18px;'>#{$orderId}</strong>.</p>

    <hr style='border:none;border-top:1px solid #eee;margin:24px 0;'>
    <h3 style='margin:0 0 8px;font-size:15px;color:#1a1a2e;'>Items Ordered</h3>
    {$itemsHtml}
    {$totalsHtml}

    <hr style='border:none;border-top:1px solid #eee;margin:24px 0;'>
    <table width='100%' cellpadding='0' cellspacing='0'>
      <tr valign='top'>
        <td width='50%' style='padding-right:16px;'>
          <h4 style='margin:0 0 6px;font-size:14px;color:#1a1a2e;'>Shipping Address</h4>
          <p style='margin:0;font-size:13px;color:#555;'>{$name}<br>{$addr}</p>
        </td>
        <td width='50%'>
          <h4 style='margin:0 0 6px;font-size:14px;color:#1a1a2e;'>Delivery &amp; Payment</h4>
          <p style='margin:0;font-size:13px;color:#555;'>
            <strong>Shipping:</strong> {$ship}<br>
            <strong>Payment:</strong>  {$payment}
          </p>
        </td>
      </tr>
    </table>

    <p style='margin-top:28px;font-size:13px;color:#888;'>
      Questions about your order? Just reply to this email.
    </p>";

    return _mailer_layout("Order Confirmation #{$orderId}", $body, $storeName);
}

function _mailer_customer_text(int $orderId, array $order, array $cart): string
{
    $lines = [
        "ORDER CONFIRMATION #{$orderId}",
        str_repeat('-', 40),
        "Hi {$order['customer_name']},",
        "Thank you for your order!",
        '',
        'Items:',
    ];
    foreach ($cart as $item) {
        $lines[] = "  {$item['name']}  x{$item['qty']}  \${$item['price']}";
    }
    $lines[] = '';
    $lines[] = 'Subtotal:  $' . number_format($order['subtotal'] ?? 0, 2);
    $lines[] = 'Tax:       $' . number_format($order['tax']      ?? 0, 2);
    $lines[] = 'Shipping:  $' . number_format($order['shipping_fee'] ?? 0, 2);
    $lines[] = 'Total:     $' . number_format($order['total']    ?? 0, 2);
    $lines[] = '';
    $lines[] = "Ship to: {$order['street_address']}, {$order['city']}, {$order['state']} {$order['zip']}, {$order['country']}";
    return implode("\n", $lines);
}

function _mailer_admin_html(
    int $orderId, array $order,
    string $itemsHtml, string $totalsHtml,
    string $date
): string {
    $name    = htmlspecialchars($order['customer_name'],   ENT_QUOTES, 'UTF-8');
    $email   = htmlspecialchars($order['customer_email'],  ENT_QUOTES, 'UTF-8');
    $phone   = htmlspecialchars($order['phone']           ?? '', ENT_QUOTES, 'UTF-8');
    $addr    = htmlspecialchars(
        "{$order['street_address']}, {$order['city']}, {$order['state']} {$order['zip']}, {$order['country']}",
        ENT_QUOTES, 'UTF-8'
    );
    $ship    = htmlspecialchars(ucfirst($order['shipping_method'] ?? ''), ENT_QUOTES, 'UTF-8');
    $payment = htmlspecialchars(ucfirst($order['payment_method']  ?? ''), ENT_QUOTES, 'UTF-8');

    $row = static function (string $label, string $value): string {
        return "<tr>
          <td style='padding:5px 20px 5px 0;font-weight:bold;color:#555;
                     white-space:nowrap;vertical-align:top;font-size:13px;'>{$label}</td>
          <td style='padding:5px 0;font-size:13px;'>{$value}</td>
        </tr>";
    };

    $body = "
    <p style='margin-top:0;'>A new order was placed on <strong>{$date}</strong>.</p>

    <h3 style='margin:0 0 10px;font-size:15px;color:#1a1a2e;'>Customer</h3>
    <table cellpadding='0' cellspacing='0' style='margin-bottom:24px;'>
      {$row('Name',     $name)}
      {$row('Email',    "<a href='mailto:{$email}' style='color:#5b2fc9;'>{$email}</a>")}
      {$row('Phone',    $phone)}
      {$row('Address',  $addr)}
      {$row('Shipping', $ship)}
      {$row('Payment',  $payment)}
    </table>

    <h3 style='margin:0 0 8px;font-size:15px;color:#1a1a2e;'>Items</h3>
    {$itemsHtml}
    {$totalsHtml}";

    return _mailer_layout("&#128722; New Order #{$orderId}", $body, 'GymSupps Admin');
}

function _mailer_admin_text(int $orderId, array $order, array $cart): string
{
    $lines = [
        "NEW ORDER #{$orderId}",
        str_repeat('-', 40),
        "Customer: {$order['customer_name']} <{$order['customer_email']}>",
        "Phone:    " . ($order['phone'] ?? ''),
        "Address:  {$order['street_address']}, {$order['city']}, {$order['state']} {$order['zip']}, {$order['country']}",
        "Shipping: " . ucfirst($order['shipping_method'] ?? ''),
        "Payment:  " . ucfirst($order['payment_method']  ?? ''),
        '',
        'Items:',
    ];
    foreach ($cart as $item) {
        $lines[] = "  {$item['name']}  x{$item['qty']}  \${$item['price']}";
    }
    $lines[] = '';
    $lines[] = 'Total: $' . number_format($order['total'] ?? 0, 2);
    return implode("\n", $lines);
}
