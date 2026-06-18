<?php
/**
 * VAT: Lebanon 2026 budget rate when enabled; 0% when disabled (admin toggle).
 */
function ensure_site_settings_table(PDO $pdo) {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS site_settings (
            id INT NOT NULL PRIMARY KEY,
            vat_enabled TINYINT(1) NOT NULL DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $stmt = $pdo->query("SELECT COUNT(*) FROM site_settings WHERE id = 1");
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->prepare("INSERT INTO site_settings (id, vat_enabled) VALUES (1, 1)")->execute();
    }
}

function vat_is_enabled(PDO $pdo) {
    ensure_site_settings_table($pdo);
    $stmt = $pdo->query("SELECT vat_enabled FROM site_settings WHERE id = 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return true;
    }
    return (int) $row['vat_enabled'] === 1;
}

/** Effective rate for checkout (0 or 12%). */
function current_tax_rate(PDO $pdo) {
    return vat_is_enabled($pdo) ? 0.12 : 0.0;
}
