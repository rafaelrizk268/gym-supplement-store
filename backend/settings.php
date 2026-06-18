<?php
session_start();
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/vat.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $enabled = vat_is_enabled($pdo);
    echo json_encode([
        'success' => true,
        'vat_enabled' => $enabled,
        'currentTaxRate' => (float) current_tax_rate($pdo),
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin login required']);
        exit;
    }
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || !array_key_exists('vat_enabled', $data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing vat_enabled']);
        exit;
    }
    $v = $data['vat_enabled'];
    $enabled = $v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'on';

    ensure_site_settings_table($pdo);
    $stmt = $pdo->prepare('UPDATE site_settings SET vat_enabled = ? WHERE id = 1');
    $stmt->execute([$enabled ? 1 : 0]);

    echo json_encode([
        'success' => true,
        'vat_enabled' => $enabled,
        'currentTaxRate' => (float) ($enabled ? 0.12 : 0.0),
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
