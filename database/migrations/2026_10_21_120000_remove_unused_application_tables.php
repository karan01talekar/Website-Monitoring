<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Remove the unused Laravel scaffold tables, preserving monitoring history.
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('password_resets');
        Schema::dropIfExists('failed_jobs');
        Schema::dropIfExists('users');
    }

    public function down(): void
    {
        // This monitoring-only application does not recreate account tables.
    }
};
