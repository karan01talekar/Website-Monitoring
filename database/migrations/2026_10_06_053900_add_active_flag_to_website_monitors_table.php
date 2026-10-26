<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (Schema::hasTable('website_monitors') && !Schema::hasColumn('website_monitors', 'is_active')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->boolean('is_active')->default(true)->after('check_interval_minutes');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('website_monitors') && Schema::hasColumn('website_monitors', 'is_active')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->dropColumn('is_active');
            });
        }
    }
};
