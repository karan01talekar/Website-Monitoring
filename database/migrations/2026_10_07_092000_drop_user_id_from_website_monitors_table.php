<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (Schema::hasTable('website_monitors') && Schema::hasColumn('website_monitors', 'user_id')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->dropColumn('user_id');
            });
        }
    }

    public function down()
    {
        if (Schema::hasTable('website_monitors') && !Schema::hasColumn('website_monitors', 'user_id')) {
            Schema::table('website_monitors', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id')->nullable();
            });
        }
    }
};
