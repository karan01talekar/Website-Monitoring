<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (Schema::hasTable('website_monitors') && !Schema::hasColumn('website_monitors', 'down_alert_sent_at')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->timestamp('down_alert_sent_at')->nullable()->after('last_down_duration_seconds');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('website_monitors') && Schema::hasColumn('website_monitors', 'down_alert_sent_at')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->dropColumn('down_alert_sent_at');
            });
        }
    }
};
