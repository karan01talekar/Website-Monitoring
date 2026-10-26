<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('website_monitors')) {
            return;
        }

        $duplicateHashes = DB::table('website_monitors')
            ->select('address_hash')
            ->groupBy('address_hash')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('address_hash');

        foreach ($duplicateHashes as $addressHash) {
            $monitors = DB::table('website_monitors')
                ->where('address_hash', $addressHash)
                ->orderBy('id')
                ->get();
            $canonical = $monitors->first();
            $latest = $monitors->sortByDesc(function ($monitor) {
                return strtotime($monitor->last_checked_at ?: $monitor->updated_at ?: $monitor->created_at) ?: 0;
            })->first();
            $monitorIds = $monitors->pluck('id')->all();
            $downtimeCount = (int) $monitors->sum('downtime_count');
            $isActive = $monitors->contains(fn ($monitor) => (bool) $monitor->is_active);

            if (Schema::hasTable('website_monitor_events')) {
                DB::table('website_monitor_events')
                    ->whereIn('website_monitor_id', $monitorIds)
                    ->update(['website_monitor_id' => $canonical->id]);
            }

            DB::table('website_monitors')
                ->where('id', $canonical->id)
                ->update([
                    'address' => $latest->address,
                    'host' => $latest->host,
                    'check_interval_minutes' => $latest->check_interval_minutes,
                    'is_active' => $isActive,
                    'current_status' => $latest->current_status,
                    'last_checked_at' => $latest->last_checked_at,
                    'last_status_changed_at' => $latest->last_status_changed_at,
                    'last_down_at' => $latest->last_down_at,
                    'last_down_duration_seconds' => $latest->last_down_duration_seconds,
                    'downtime_count' => $downtimeCount,
                    'updated_at' => $latest->updated_at,
                ]);

            DB::table('website_monitors')
                ->whereIn('id', array_slice($monitorIds, 1))
                ->delete();
        }

        Schema::table('website_monitors', function (Blueprint $table) {
            $table->dropUnique('website_monitors_user_tenant_address_unique');
            $table->unique('address_hash', 'website_monitors_address_hash_unique');
        });
    }

    public function down()
    {
        if (!Schema::hasTable('website_monitors')) {
            return;
        }

        Schema::table('website_monitors', function (Blueprint $table) {
            $table->dropUnique('website_monitors_address_hash_unique');
            $table->unique(
                ['user_id', 'tenant_type', 'address_hash'],
                'website_monitors_user_tenant_address_unique'
            );
        });
    }
};
