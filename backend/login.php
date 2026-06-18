<?php
session_start();
require_once 'db.php';

header('Content-Type: application/json');

$data = $_POST;
$login = $data['login'] ?? '';
$password = $data['password'] ?? '';

// Query for user by username or email
$stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? OR email = ?");
$stmt->execute([$login, $login]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user && password_verify($password, $user['password'])) {
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role'] = $user['role'];
    $_SESSION['admin_logged_in'] = ($user['role'] === 'admin');
    echo json_encode(['success' => true, 'role' => $user['role']]);
} else {
    echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
}
?>