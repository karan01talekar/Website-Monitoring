@echo off
setlocal
cd /d "%~dp0"
set "PHP_OPTIONS="
php -m | findstr /i /x "pdo_sqlite" >nul
if errorlevel 1 set "PHP_INI_SCAN_DIR=%PHP_INI_SCAN_DIR%;%CD%\config\php"
if "%~1"=="setup" goto setup
if "%~1"=="schedule" goto schedule
if "%~1"=="check" goto check
if "%~1"=="test" goto test
php %PHP_OPTIONS% -S 127.0.0.1:8001 -t public server.php
exit /b %errorlevel%
:setup
if not exist .env copy .env.example .env >nul
if not exist database\database.sqlite type nul >database\database.sqlite
php %PHP_OPTIONS% artisan key:generate --force
if errorlevel 1 exit /b %errorlevel%
php %PHP_OPTIONS% artisan migrate --force
exit /b %errorlevel%
:schedule
php %PHP_OPTIONS% artisan schedule:work
exit /b %errorlevel%
:check
php %PHP_OPTIONS% artisan reports:check-websites
exit /b %errorlevel%
:test
php %PHP_OPTIONS% vendor/phpunit/phpunit/phpunit
exit /b %errorlevel%
