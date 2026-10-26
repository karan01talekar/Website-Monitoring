<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        if (!Schema::hasTable('website_monitors')) {
            Schema::create('website_monitors', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->string('tenant_type', 100)->default('');
                $table->string('address', 2048);
                $table->char('address_hash', 64);
                $table->string('host', 255);
                $table->string('notification_email')->nullable();
                $table->unsignedTinyInteger('check_interval_minutes');
                $table->string('current_status', 16)->nullable();
                $table->timestamp('last_checked_at')->nullable();
                $table->timestamp('last_status_changed_at')->nullable();
                $table->timestamp('last_down_at')->nullable();
                $table->unsignedBigInteger('last_down_duration_seconds')->nullable();
                $table->timestamp('down_alert_sent_at')->nullable();
                $table->unsignedInteger('downtime_count')->default(0);
                $table->timestamps();

                $table->unique(
                    ['user_id', 'tenant_type', 'address_hash'],
                    'website_monitors_user_tenant_address_unique'
                );
                $table->index(['last_checked_at', 'check_interval_minutes']);
            });
        }

        if (!Schema::hasTable('website_monitor_events')) {
            Schema::create('website_monitor_events', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('website_monitor_id');
                $table->string('status', 16);
                $table->string('previous_status', 16)->nullable();
                $table->timestamp('checked_at');
                $table->unsignedBigInteger('down_duration_seconds')->nullable();
                $table->text('message')->nullable();
                $table->timestamps();

                $table->foreign('website_monitor_id')
                    ->references('id')
                    ->on('website_monitors')
                    ->onDelete('cascade');
                $table->index(['website_monitor_id', 'checked_at']);
            });
        }
    }

    public function down()
    {
        Schema::dropIfExists('website_monitor_events');
        Schema::dropIfExists('website_monitors');
    }
};
