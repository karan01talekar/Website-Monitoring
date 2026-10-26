<?php

namespace Tests\Feature;

use App\Services\WebsiteAvailabilityChecker;
use App\Services\WebsiteMonitorRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class MonitoringTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_page_runs_without_cms_authentication(): void
    {
        config(['app.website_url' => '']);
        $this->withoutVite();
        $this->get('/reports')->assertOk()->assertInertia(fn (AssertableInertia $page) =>
            $page->component('Reports/Index')->where('defaultAddress', '')
        );
        $this->assertDatabaseCount('website_monitors', 0);
        $this->assertFalse(Schema::hasTable('users'));
        $this->assertFalse(Schema::hasTable('password_resets'));
        $this->assertFalse(Schema::hasTable('personal_access_tokens'));
    }

    public function test_background_check_records_downtime_and_recovery(): void
    {
        $monitorId = DB::table('website_monitors')->insertGetId([
            'address' => 'https://example.com',
            'address_hash' => hash('sha256', 'https://example.com'),
            'host' => 'example.com',
            'tenant_type' => '',
            'check_interval_minutes' => 1,
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->mock(WebsiteAvailabilityChecker::class, function ($mock) {
            $mock->shouldReceive('check')->once()->with('https://example.com')
                ->andReturn(['status' => 'down', 'message' => 'Connection failed']);
        });
        $this->artisan('reports:check-websites')->assertExitCode(0);
        $this->assertDatabaseHas('website_monitors', [
            'id' => $monitorId, 'current_status' => 'down', 'downtime_count' => 1,
        ]);

        app(WebsiteMonitorRecorder::class)->record($monitorId, ['status' => 'up'], now()->addMinute());
        $this->assertDatabaseHas('website_monitor_events', [
            'website_monitor_id' => $monitorId, 'status' => 'up', 'down_duration_seconds' => 60,
        ]);

        $this->deleteJson('/reports/monitor', ['address' => 'https://example.com'])->assertSuccessful();
        $this->assertDatabaseHas('website_monitors', ['id' => $monitorId, 'is_active' => false]);
        $this->assertDatabaseCount('website_monitor_events', 2);
    }
}
