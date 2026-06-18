<?php
// ── 1. Load .env ──────────────────────────────────────────────────────────────

/**
 * Parse .env into $_ENV / $_SERVER / putenv().
 * Skips comments, blank lines, and lines without '='.
 * Does NOT override keys already present in the real environment.
 */
function load_env(string $path): void {
    if (!is_file($path) || !is_readable($path)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Server configuration error']);
        exit;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value);
        // Strip surrounding matching quotes
        if (strlen($value) >= 2 && preg_match('/^(["\'])(.*)\\1$/s', $value, $m)) {
            $value = $m[2];
        }
        if ($key !== '' && !array_key_exists($key, $_ENV)) {
            $_ENV[$key]    = $value;
            $_SERVER[$key] = $value;
            putenv("{$key}={$value}");
        }
    }
}

load_env(__DIR__ . '/../.env');

// ── 2. Configure error reporting ──────────────────────────────────────────────

$appEnv  = $_ENV['APP_ENV']  ?? 'production';
$logPath = $_ENV['LOG_PATH'] ?? '';

// Resolve relative LOG_PATH against the project root (one level above backend/)
if ($logPath !== '' && !preg_match('/^([A-Za-z]:[\/\\\\]|\/)/', $logPath)) {
    $logPath = realpath(__DIR__ . '/../' . ltrim($logPath, './\\'))
        ?: (__DIR__ . '/../logs/php_errors.log');
}

// Always log errors — never suppress them silently
ini_set('log_errors', '1');
if ($logPath !== '') {
    ini_set('error_log', $logPath);
}
error_reporting(E_ALL);

if ($appEnv === 'production') {
    // Never send error output to the browser in production
    ini_set('display_errors', '0');
    ini_set('display_startup_errors', '0');
} else {
    // Development: show errors for easier local debugging
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
}

// ── 3. Global handlers (catch anything that slips past try/catch) ─────────────

/**
 * Returns a generic JSON 500 without leaking internal details.
 * The full Throwable is written to the error log.
 */
function send_error_response(string $logMessage): void {
    error_log($logMessage);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    echo json_encode(['error' => 'An unexpected server error occurred']);
    exit;
}

// Uncaught exceptions (including PDOException that escapes a try/catch)
set_exception_handler(function (\Throwable $e): void {
    send_error_response(sprintf(
        'Uncaught %s: %s in %s:%d',
        get_class($e),
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    ));
});

// PHP errors (E_WARNING, E_NOTICE, E_USER_ERROR, etc.) converted to log entries
set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline): bool {
    // Only handle errors that match the current error_reporting mask
    if (!(error_reporting() & $errno)) {
        return false; // let PHP handle it normally
    }

    $msg = sprintf('PHP Error [%d]: %s in %s:%d', $errno, $errstr, $errfile, $errline);

    // E_USER_ERROR and E_ERROR are fatal — respond and stop
    if (in_array($errno, [E_ERROR, E_USER_ERROR], true)) {
        send_error_response($msg);
    }

    // Non-fatal: log only, don't output anything
    error_log($msg);
    return true; // suppress PHP's built-in handler
});

// Catch fatal errors that kill the process before set_error_handler can run
register_shutdown_function(function (): void {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        send_error_response(sprintf(
            'Fatal PHP Error [%d]: %s in %s:%d',
            $err['type'],
            $err['message'],
            $err['file'],
            $err['line']
        ));
    }
});

// ── 4. Database connection ────────────────────────────────────────────────────

$host    = $_ENV['DB_HOST']    ?? 'localhost';
$db      = $_ENV['DB_NAME']    ?? '';
$user    = $_ENV['DB_USER']    ?? '';
$pass    = $_ENV['DB_PASS']    ?? '';
$charset = $_ENV['DB_CHARSET'] ?? 'utf8mb4';

if ($db === '' || $user === '') {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Server configuration error']);
    exit;
}

$dsn = "mysql:host={$host};dbname={$db};charset={$charset}";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    // Full details go to the log; browser gets nothing useful to an attacker
    error_log('PDO connection failed: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}
