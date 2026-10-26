<?php

use Illuminate\Support\Facades\Route;

Route::redirect('/', '/reports');

Route::group([], function () {
    Route::get('/reports', [App\Http\Controllers\SiteReportController::class, 'index'])->name('reports.index');
    Route::get('/reports/data', [App\Http\Controllers\SiteReportController::class, 'data'])->name('reports.data');
    Route::get('/reports/monitor', [App\Http\Controllers\SiteReportController::class, 'monitorStatus'])->name('reports.monitor.status');
    Route::post('/reports/monitor', [App\Http\Controllers\SiteReportController::class, 'storeMonitor'])->name('reports.monitor.store');
    Route::delete('/reports/monitor', [App\Http\Controllers\SiteReportController::class, 'destroyMonitor'])->name('reports.monitor.destroy');
});

