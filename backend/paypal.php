<?php
/**
 * PayPal order lifecycle: create (server-side) and capture (server-side).
 *
 * POST /backend/paypal.php?action=create  → { id: "<paypal_order_id>" }
 * POST /backend/paypal.php?action=capture → { success: true, paypal_order_id: "…" }
 *
 * The PAYPAL_SECRET never leaves this file; the browser only ever sees the
 * client-id (public) and the opaque PayPal order ID.
 */
header('Content-Type: application/json');
require_once __DIR__ . '/db.php'; // loads .env + error handlers

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$clientId = trim($_ENV['PAYPAL_CLIENT_ID'] ?? '');
$secret   = trim($_ENV['PAYPAL_SECRET']    ?? '');
$mode     = $_ENV['PAYPAL_MODE']           ?? 'sandbox';
$currency = $_ENV['PAYPAL_CURRENCY']       ?? 'USD';

if ($clientId === '' || $secret === '') {
    http_response_code(503);
    echo json_encode(['error' => 'PayPal is not configured on this server']);
    exit;
}

// Detect un-replaced placeholder values left over from .env.example
if (str_starts_with($clientId, 'YOUR_') || str_starts_with($secret, 'YOUR_')) {
    http_response_code(503);
    error_log('PayPal: .env still contains placeholder credentials — replace PAYPAL_CLIENT_ID and PAYPAL_SECRET');
    echo json_encode(['error' => 'PayPal credentials are placeholder values. Open .env and replace PAYPAL_CLIENT_ID and PAYPAL_SECRET with your real sandbox credentials.']);
    exit;
}

$baseUrl = ($mode === 'live')
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

// ── helper: get a short-lived OAuth2 access token ────────────────────────────
function paypal_access_token(string $base, string $id, string $secret): string {
    $ch = curl_init("{$base}/v1/oauth2/token");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_USERPWD        => "{$id}:{$secret}",
        CURLOPT_POSTFIELDS     => 'grant_type=client_credentials',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Accept: application/json', 'Accept-Language: en_US'],
        CURLOPT_TIMEOUT        => 15,
    ]);
    $body     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$body) return '';
    return json_decode($body, true)['access_token'] ?? '';
}

$action = $_GET['action'] ?? '';
$data   = json_decode(file_get_contents('php://input'), true) ?? [];

// ── POST ?action=create ───────────────────────────────────────────────────────
if ($action === 'create') {
    $amount = number_format((float) ($data['amount'] ?? 0), 2, '.', '');
    if ((float) $amount <= 0) {
        http_response_code(422);
        echo json_encode(['error' => 'Invalid order amount']);
        exit;
    }

    $token = paypal_access_token($baseUrl, $clientId, $secret);
    if ($token === '') {
        http_response_code(502);
        echo json_encode(['error' => 'PayPal authentication failed']);
        exit;
    }

    $payload = json_encode([
        'intent'              => 'CAPTURE',
        'purchase_units'      => [[
            'amount' => ['currency_code' => $currency, 'value' => $amount],
        ]],
        'application_context' => [
            'shipping_preference' => 'NO_SHIPPING',
            'user_action'         => 'PAY_NOW',
            'brand_name'          => 'GymSupps',
        ],
    ]);

    $ch = curl_init("{$baseUrl}/v2/checkout/orders");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "Authorization: Bearer {$token}",
        ],
        CURLOPT_POSTFIELDS     => $payload,
    ]);
    $result   = json_decode(curl_exec($ch), true);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 201 || empty($result['id'])) {
        error_log('PayPal create order failed: ' . json_encode($result));
        http_response_code(502);
        echo json_encode(['error' => 'Could not create PayPal order']);
        exit;
    }

    echo json_encode(['id' => $result['id']]);
    exit;
}

// ── POST ?action=capture ──────────────────────────────────────────────────────
if ($action === 'capture') {
    $orderId = trim((string) ($data['orderID'] ?? ''));

    // PayPal order IDs are uppercase alphanumeric, typically 17 chars
    if ($orderId === '' || !preg_match('/^[A-Z0-9]{3,64}$/i', $orderId)) {
        http_response_code(422);
        echo json_encode(['error' => 'Invalid PayPal order ID']);
        exit;
    }

    $token = paypal_access_token($baseUrl, $clientId, $secret);
    if ($token === '') {
        http_response_code(502);
        echo json_encode(['error' => 'PayPal authentication failed']);
        exit;
    }

    $ch = curl_init("{$baseUrl}/v2/checkout/orders/{$orderId}/capture");
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "Authorization: Bearer {$token}",
        ],
        CURLOPT_POSTFIELDS     => '{}',
    ]);
    $result   = json_decode(curl_exec($ch), true);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 201 || ($result['status'] ?? '') !== 'COMPLETED') {
        error_log('PayPal capture failed: ' . json_encode($result));
        http_response_code(400);
        echo json_encode(['error' => 'Payment capture was not completed']);
        exit;
    }

    echo json_encode(['success' => true, 'paypal_order_id' => $orderId]);
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
