# Website Monitoring

Standalone Laravel + React application for domain expiry, SSL validity, website uptime, downtime history, and down alert emails. All runtime files, dependencies, assets, configuration, and database belong to this folder. CMS-admin is not required.

## Run on Windows

From PowerShell:

```powershell
cd D:\Laravel\Website_Monitoring
.\run.cmd
```

Open http://127.0.0.1:8001/reports.

The frontend is already built. For background monitoring, keep a second terminal running:

```powershell
cd D:\Laravel\Website_Monitoring
.\run.cmd schedule
```

Optional frontend development server, in another terminal:

```powershell
npm.cmd run dev
```

## Fresh installation

Requires PHP 8.1+ with PDO SQLite, Composer, and Node.js/npm.

```powershell
composer install
npm.cmd install
.\run.cmd setup
npm.cmd run build
.\run.cmd
```

The Windows runner enables PDO SQLite for its PHP process when the DLL is available but not enabled in php.ini. It does not change the system PHP configuration. Other platforms should enable pdo_sqlite, copy .env.example to .env, create database/database.sqlite, then run php artisan key:generate and php artisan migrate before php artisan serve --port=8001.

The SQLite database is local at database/database.sqlite. No CMS database or credentials are used.

## Configuration

Enter the target URL in the report screen. Set WEBSITE_URL in this application's .env to prefill a default target and automatically create its monitor.

Down alerts use MAIL_MAILER=log by default and are written to storage/logs/laravel.log. Set MAIL_MAILER=smtp and this application's MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_ENCRYPTION, and MAIL_FROM_ADDRESS to send actual email. SSL uses the system PHP CA configuration.

This local application opens directly without a CMS login and binds to 127.0.0.1. Add standalone authentication before exposing it to other users.

## Checks

```powershell
.\run.cmd test
.\run.cmd check
```

Tests use an isolated in-memory SQLite database and mocked website checks.

## Folder structure

- app/Http/Controllers: report and monitor endpoints
- app/Http/Middleware: Inertia integration
- app/Services: availability checks and downtime/email recording
- app/Console: monitoring command and scheduler
- bootstrap, config, public: independent Laravel runtime
- database/migrations: website monitoring schema only
- resources/js/Pages/Reports/Index.tsx: report screen
- resources/js/api.js: standalone HTTP client without tenant prefixes or CMS tokens
- resources/views/app.blade.php: Inertia HTML shell
- routes/web.php: report routes and home redirect
- tests/Feature: standalone integration tests

"# Website-Monitoring" 
