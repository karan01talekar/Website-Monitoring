<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class WebsiteMonitorRecorder
{
    public function record(int $monitorId, array $result, $checkedAt): void
    {
        $downAlert = DB::transaction(function () use ($monitorId, $result, $checkedAt) {
            $monitor = DB::table('website_monitors')
                ->where('id', $monitorId)
                ->lockForUpdate()
                ->first();

            if (!$monitor) {
                return null;
            }

            $previousStatus = $monitor->current_status;
            $status = $result['status'];
            $isNewDowntime = $status === 'down' && $previousStatus !== 'down';
            $lastDownAt = $monitor->last_down_at;
            $lastDownDuration = $monitor->last_down_duration_seconds;
            $changedAt = $monitor->last_status_changed_at;
            $downtimeCount = (int) $monitor->downtime_count;
            $downAlertSentAt = $monitor->down_alert_sent_at;

            if ($previousStatus !== $status || ($status === 'down' && !$lastDownAt)) {
                $changedAt = $checkedAt;
                $downDuration = null;
                if ($status === 'down') {
                    if ($previousStatus !== 'down') {
                        $downtimeCount++;
                    }
                    $lastDownAt = $checkedAt;
                    $lastDownDuration = null;
                    $downAlertSentAt = null;
                } elseif ($previousStatus === 'down') {
                    $downStartedAt = $monitor->last_status_changed_at
                        ?: ($lastDownAt ?: $monitor->last_checked_at);
                    if ($downStartedAt) {
                        $downDuration = max(0, $checkedAt->getTimestamp() - strtotime($downStartedAt));
                        $lastDownAt = $downStartedAt;
                        $lastDownDuration = $downDuration;
                    }
                    $downAlertSentAt = null;
                }

                DB::table('website_monitor_events')->insert([
                    'website_monitor_id' => $monitorId,
                    'status' => $status,
                    'previous_status' => $previousStatus,
                    'checked_at' => $checkedAt,
                    'down_duration_seconds' => $downDuration,
                    'message' => $status === 'down' && $previousStatus === 'down'
                        ? 'Downtime start time was reset at this check because the previous timestamp was missing.'
                        : ($result['message'] ?? null),
                    'created_at' => $checkedAt,
                    'updated_at' => $checkedAt,
                ]);
            }

            DB::table('website_monitors')
                ->where('id', $monitorId)
                ->update([
                    'current_status' => $status,
                    'last_checked_at' => $checkedAt,
                    'last_status_changed_at' => $changedAt,
                    'last_down_at' => $lastDownAt,
                    'last_down_duration_seconds' => $lastDownDuration,
                    'downtime_count' => $downtimeCount,
                    'down_alert_sent_at' => $downAlertSentAt,
                    'updated_at' => $checkedAt,
                ]);

            return $status === 'down'
                && $monitor->notification_email
                && ($isNewDowntime || !$monitor->down_alert_sent_at)
                ? [
                    'email' => $monitor->notification_email,
                    'address' => $monitor->address,
                    'checked_at' => $checkedAt,
                    'down_started_at' => $lastDownAt,
                    'message' => $result['message'] ?? null,
                ]
                : null;
        });

        if (!$downAlert) {
            return;
        }

        try {
            Mail::raw(
                "The monitored website {$downAlert['address']} was detected as down at {$downAlert['checked_at']}."
                    . ($downAlert['message'] ? "\n\nDetails: {$downAlert['message']}" : ''),
                function ($message) use ($downAlert) {
                    $message->to($downAlert['email'])
                        ->subject('Website down alert: ' . $downAlert['address']);
                }
            );

            DB::table('website_monitors')
                ->where('id', $monitorId)
                ->where('current_status', 'down')
                ->where('last_down_at', $downAlert['down_started_at'])
                ->update([
                    'down_alert_sent_at' => now(),
                    'updated_at' => now(),
                ]);
        } catch (Throwable $exception) {
            Log::error('Website downtime alert email could not be sent.', [
                'website_monitor_id' => $monitorId,
                'notification_email' => $downAlert['email'],
                'exception' => $exception,
            ]);
        }
    }
}
