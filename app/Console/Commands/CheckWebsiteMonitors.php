<?php

namespace App\Console\Commands;

use App\Services\WebsiteAvailabilityChecker;
use App\Services\WebsiteMonitorRecorder;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CheckWebsiteMonitors extends Command
{
    protected $signature = 'reports:check-websites';

    protected $description = 'Check due monitored websites and record status changes';

    public function handle(
        WebsiteAvailabilityChecker $checker,
        WebsiteMonitorRecorder $recorder
    ): int
    {
        if (DB::table('website_monitors')->where('is_active', true)->count() === 0) {
            $defaultUrl = config('app.website_url');
            if ($defaultUrl) {
                try {
                    $cleanAddress = trim($defaultUrl);
                    if (!preg_match('/^https?:\/\//i', $cleanAddress)) {
                        $cleanAddress = 'https://' . $cleanAddress;
                    }
                    $host = parse_url($cleanAddress, PHP_URL_HOST) ?: '';
                    if ($host) {
                        $hash = hash('sha256', $cleanAddress);
                        $existing = DB::table('website_monitors')->where('address_hash', $hash)->first();
                        if ($existing) {
                            DB::table('website_monitors')->where('id', $existing->id)->update([
                                'is_active' => true,
                                'updated_at' => now(),
                            ]);
                        } else {
                            $now = now();
                            $monitorId = DB::table('website_monitors')->insertGetId([
                                'tenant_type' => (string)(config('app.tenant_type') ?? ''),
                                'address' => $cleanAddress,
                                'address_hash' => $hash,
                                'host' => $host,
                                'check_interval_minutes' => 1,
                                'notification_email' => env('MAIL_FROM_ADDRESS', 'admin@example.com'),
                                'is_active' => true,
                                'created_at' => $now,
                                'updated_at' => $now,
                            ]);
                            $result = $checker->check($cleanAddress);
                            $recorder->record((int)$monitorId, $result, $now);
                        }
                    }
                } catch (\Throwable $e) {}
            }
        }

        DB::table('website_monitors')
            ->where('is_active', true)
            ->orderBy('id')
            ->chunkById(100, function ($monitors) use ($checker, $recorder) {
                foreach ($monitors as $monitor) {
                    $checkedAt = now();
                    $dueAt = $checkedAt->copy()->subMinutes((int) $monitor->check_interval_minutes);
                    if (
                        $monitor->last_checked_at
                        && Carbon::parse($monitor->last_checked_at)->greaterThan($dueAt)
                    ) {
                        continue;
                    }

                    $result = $checker->check($monitor->address);
                    $recorder->record((int) $monitor->id, $result, $checkedAt);
                }
            });

        return Command::SUCCESS;
    }
}

