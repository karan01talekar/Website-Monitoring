param(
    [ValidateSet('serve', 'schedule', 'check', 'setup', 'test')]
    [string]$Task = 'serve'
)

Set-Location $PSScriptRoot
$phpOptions = @()
$phpModules = & php -m
if ($phpModules -notcontains 'pdo_sqlite') {
    $env:PHP_INI_SCAN_DIR = "$env:PHP_INI_SCAN_DIR;$PSScriptRoot\config\php"
}

switch ($Task) {
    'setup' {
        if (!(Test-Path .env)) { Copy-Item .env.example .env }
        if (!(Test-Path database/database.sqlite)) {
            New-Item -ItemType File database/database.sqlite | Out-Null
        }
        & php @phpOptions artisan key:generate --force
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & php @phpOptions artisan migrate --force
    }
    'serve' { & php @phpOptions -S 127.0.0.1:8001 -t public server.php }
    'schedule' { & php @phpOptions artisan schedule:work }
    'check' { & php @phpOptions artisan reports:check-websites }
    'test' { & php @phpOptions vendor/phpunit/phpunit/phpunit }
}
exit $LASTEXITCODE
