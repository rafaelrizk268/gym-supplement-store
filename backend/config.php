<?php
/**
 * Public configuration endpoint.
 * Returns only values that are safe to expose to the browser
 * (public client IDs, modes — never secrets).
 */
header('Content-Type: application/json');
require_once __DIR__ . '/db.php'; // loads .env + error handlers

echo json_encode([
    'paypal_client_id'  => $_ENV['PAYPAL_CLIENT_ID']   ?? '',
    'paypal_mode'       => $_ENV['PAYPAL_MODE']        ?? 'sandbox',
    'currency'          => $_ENV['PAYPAL_CURRENCY']    ?? 'USD',
    'whatsapp_number'   => $_ENV['WHATSAPP_NUMBER']    ?? '',
]);
