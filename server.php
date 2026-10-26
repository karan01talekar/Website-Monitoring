<?php

$path = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
$publicPath = realpath(__DIR__ . '/public');
$file = realpath($publicPath . $path);

if ($path !== '/' && $file && str_starts_with($file, $publicPath . DIRECTORY_SEPARATOR) && is_file($file)) {
    return false;
}

require_once __DIR__ . '/public/index.php';
