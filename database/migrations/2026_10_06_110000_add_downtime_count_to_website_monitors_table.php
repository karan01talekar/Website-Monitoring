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

        if (!Schema::hasColumn('website_monitors', 'downtime_count')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->unsignedInteger('downtime_count')->default(0)->after('last_down_duration_seconds');
            });
        }

        if (Schema::hasTable('website_monitor_events')) {
            DB::table('website_monitors')
                ->select('id')
                ->orderBy('id')
                ->chunkById(100, function ($monitors) {
                    foreach ($monitors as $monitor) {
                        $count = DB::table('website_monitor_events')
                            ->where('website_monitor_id', $monitor->id)
                            ->where('status', 'down')
                            ->where(function ($query) {
                                $query->whereNull('previous_status')
                                    ->orWhere('previous_status', '<>', 'down');
                            })
                            ->count();

                        DB::table('website_monitors')
                            ->where('id', $monitor->id)
                            ->update(['downtime_count' => $count]);
                    }
                });
        }
    }

    public function down()
    {
        if (Schema::hasTable('website_monitors') && Schema::hasColumn('website_monitors', 'downtime_count')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->dropColumn('downtime_count');
            });
        }
    }
};
