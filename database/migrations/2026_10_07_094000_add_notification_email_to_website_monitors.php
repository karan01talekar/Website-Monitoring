<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (Schema::hasTable('website_monitors') && !Schema::hasColumn('website_monitors', 'notification_email')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->string('notification_email')->nullable()->after('host');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('website_monitors') && Schema::hasColumn('website_monitors', 'notification_email')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->dropColumn('notification_email');
            });
        }
    }
};
