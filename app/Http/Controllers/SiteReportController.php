<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Throwable;

class SiteReportController extends Controller
{
    protected function getTargetWebsiteAddress(Request $request): string
    {
        $address = (string) config('app.website_url', '');
        $tenantType = config('app.tenant_type');
        if ($tenantType && !str_ends_with($address, '/' . $tenantType)) {
            $address = rtrim($address, '/') . '/' . $tenantType;
        }

        return $address;
    }

    protected function ensureDefaultMonitor(string $targetAddress): ?int
    {
        try {
            [$address, , $host] = $this->validateAddress($targetAddress);
            $tenantType = (string) (config('app.tenant_type') ?? '');
            $addressHash = hash('sha256', $address);
            $existing = DB::table('website_monitors')
                ->where('address_hash', $addressHash)
                ->first();

            if ($existing) {
                if (!$existing->is_active) {
                    DB::table('website_monitors')->where('id', $existing->id)->update([
                        'is_active' => true,
                        'updated_at' => now(),
                    ]);
                }
                return (int) $existing->id;
            }

            $email = config('mail.from.address')
                ?? 'admin@example.com';
            $now = now();
            $monitorId = (int) DB::table('website_monitors')->insertGetId([
                'tenant_type' => $tenantType,
                'address' => $address,
                'address_hash' => $addressHash,
                'host' => $host,
                'check_interval_minutes' => 1,
                'notification_email' => $email,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $check = app(\App\Services\WebsiteAvailabilityChecker::class)->check($address);
            app(\App\Services\WebsiteMonitorRecorder::class)->record($monitorId, $check, $now);

            return $monitorId;
        } catch (\Throwable $e) {
            \Log::warning('Could not automatically start default website monitor: ' . $e->getMessage());
            return null;
        }
    }

    public function index(Request $request)
    {
        $defaultAddress = $this->getTargetWebsiteAddress($request);
        if ($defaultAddress !== '') {
            $this->ensureDefaultMonitor($defaultAddress);
        }

        return Inertia::render('Reports/Index', [
            'defaultAddress' => $defaultAddress,
        ]);
    }

    public function data(Request $request)
    {
        $address = $request->input(
            'address',
            $this->getTargetWebsiteAddress($request)
        );

        if (!is_string($address)) {
            throw ValidationException::withMessages([
                'address' => 'Enter a valid website address.',
            ]);
        }

        [$address, $urlParts, $host, $isLocalHost, $isPublicDomain] = $this->validateAddress($address);
        if (!$isPublicDomain) {
            return response()->json([
                'domain' => $host,
                'domain_expiry' => [
                    'status' => 'unknown',
                    'message' => 'Domain registration expiry is unavailable for localhost or IP addresses.',
                ],
                'ssl' => [
                    'status' => 'unknown',
                    'message' => 'SSL certificate checks require a public hostname.',
                ],
                'uptime' => $this->getUptime($urlParts, $host, $request),
            ]);
        }

        return response()->json([
            'domain' => $host,
            'domain_expiry' => $this->getDomainExpiry($host),
            'ssl' => $this->getSslValidity(
                $host,
                strtolower($urlParts['scheme']) === 'https' ? (int) ($urlParts['port'] ?? 443) : 443
            ),
            'uptime' => $this->getUptime($urlParts, $host, $request),
        ]);
    }

    public function storeMonitor(Request $request)
    {
        $validated = $request->validate([
            'address' => ['nullable', 'string', 'max:2048'],
            'check_interval_minutes' => ['required', 'integer', 'in:1,2,5,15'],
            'notification_email' => ['required', 'email', 'max:255'],
        ]);
        $targetAddress = !empty($validated['address']) ? $validated['address'] : $this->getTargetWebsiteAddress($request);
        [$address, , $host] = $this->validateAddress($targetAddress);

        $tenantType = (string) (config('app.tenant_type') ?? '');
        $addressHash = hash('sha256', $address);
        $now = now();
        $existing = DB::table('website_monitors')
            ->where('address_hash', $addressHash)
            ->first();
        if ($existing) {
            DB::table('website_monitors')->where('id', $existing->id)->update([
                'address' => $address,
                'host' => $host,
                'check_interval_minutes' => (int) $validated['check_interval_minutes'],
                'notification_email' => $validated['notification_email'],
                'is_active' => true,
                'updated_at' => $now,
            ]);
            $monitorId = (int) $existing->id;
        } else {
            try {
                $monitorId = (int) DB::table('website_monitors')->insertGetId([
                    'tenant_type' => $tenantType,
                    'address' => $address,
                    'address_hash' => $addressHash,
                    'host' => $host,
                    'check_interval_minutes' => (int) $validated['check_interval_minutes'],
                    'notification_email' => $validated['notification_email'],
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            } catch (QueryException $exception) {
                $existing = DB::table('website_monitors')
                    ->where('address_hash', $addressHash)
                    ->first();
                if (!$existing) {
                    throw $exception;
                }

                DB::table('website_monitors')->where('id', $existing->id)->update([
                    'address' => $address,
                    'host' => $host,
                    'check_interval_minutes' => (int) $validated['check_interval_minutes'],
                    'notification_email' => $validated['notification_email'],
                    'is_active' => true,
                    'updated_at' => $now,
                ]);
                $monitorId = (int) $existing->id;
            }
        }

        if (!$monitorId) {
            throw new \RuntimeException('The website monitor could not be saved.');
        }

        $check = app(\App\Services\WebsiteAvailabilityChecker::class)->check($address);
        app(\App\Services\WebsiteMonitorRecorder::class)->record($monitorId, $check, $now);

        return response()->json($this->getMonitorPayload($monitorId), 201);
    }

    public function monitorStatus(Request $request)
    {
        $address = $request->query('address');
        if (!is_string($address) || trim($address) === '') {
            $address = $this->getTargetWebsiteAddress($request);
        }

        try {
            [$address] = $this->validateAddress($address);
            $monitor = DB::table('website_monitors')
                ->where('address_hash', hash('sha256', $address))
                ->first();

            if (!$monitor) {
                $monitorId = $this->ensureDefaultMonitor($address);
                if ($monitorId) {
                    $monitor = DB::table('website_monitors')->where('id', $monitorId)->first();
                }
            }

            if ($monitor && $monitor->is_active) {
                $checkedAt = now();
                $dueAt = $checkedAt->copy()->subMinutes((int) $monitor->check_interval_minutes);

                if (!$monitor->last_checked_at || Carbon::parse($monitor->last_checked_at)->lte($dueAt)) {
                    $lock = \Illuminate\Support\Facades\Cache::lock(
                        'website-monitor:' . hash('sha256', DB::connection()->getDatabaseName() . ':' . $monitor->id),
                        60
                    );

                    if ($lock->get()) {
                        try {
                            $result = app(\App\Services\WebsiteAvailabilityChecker::class)->check($monitor->address);
                            app(\App\Services\WebsiteMonitorRecorder::class)->record((int) $monitor->id, $result, $checkedAt);
                        } finally {
                            $lock->release();
                        }
                    }
                }
            }

            return response()->json($monitor
                ? $this->getMonitorPayload((int) $monitor->id)
                : ['monitor' => null, 'events' => []])
                ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
                ->header('Pragma', 'no-cache');
        } catch (\Throwable $e) {
            return response()->json(['monitor' => null, 'events' => []]);
        }
    }

    public function destroyMonitor(Request $request)
    {
        $address = $request->input('address');
        if (!is_string($address) || trim($address) === '') {
            throw ValidationException::withMessages([
                'address' => 'Enter a website address to stop monitoring.',
            ]);
        }

        [$address] = $this->validateAddress($address);
        DB::table('website_monitors')
            ->where('address_hash', hash('sha256', $address))
            ->update([
                'is_active' => false,
                'updated_at' => now(),
            ]);

        return response()->json(['message' => 'Monitoring stopped. Website and history were retained.']);
    }

    private function getMonitorPayload(int $monitorId): array
    {
        $monitor = DB::table('website_monitors')->where('id', $monitorId)->first();
        if (!$monitor) {
            return ['monitor' => null, 'events' => []];
        }

        $events = DB::table('website_monitor_events')
            ->where('website_monitor_id', $monitorId)
            ->orderBy('checked_at')
            ->orderBy('id')
            ->get([
                'id',
                'status',
                'previous_status',
                'checked_at',
                'down_duration_seconds',
                'message',
            ]);
        $downtimeRecords = [];
        $openDowntime = null;
        foreach ($events as $event) {
            if ($event->status === 'down' && $event->previous_status !== 'down') {
                $openDowntime = [
                    'started_at' => $event->checked_at,
                    'recovered_at' => null,
                    'duration_seconds' => null,
                    'ongoing' => true,
                ];
            } elseif (
                $event->status === 'up'
                && $event->previous_status === 'down'
                && $openDowntime
            ) {
                $openDowntime['recovered_at'] = $event->checked_at;
                $openDowntime['duration_seconds'] = $event->down_duration_seconds
                    ?? max(0, strtotime($event->checked_at) - strtotime($openDowntime['started_at']));
                $openDowntime['ongoing'] = false;
                $downtimeRecords[] = $openDowntime;
                $openDowntime = null;
            }
        }

        if ($openDowntime) {
            $downtimeRecords[] = $openDowntime;
        } elseif ($monitor->current_status === 'down') {
            $startedAt = $monitor->last_status_changed_at
                ?: ($monitor->last_down_at ?: $monitor->last_checked_at);
            if ($startedAt) {
                $downtimeRecords[] = [
                    'started_at' => $startedAt,
                    'recovered_at' => null,
                    'duration_seconds' => max(0, now()->getTimestamp() - strtotime($startedAt)),
                    'ongoing' => true,
                ];
            }
        }

        $events = $events->sortByDesc('checked_at')->take(20)->values();
        $lastDowntime = null;
        if ($monitor->last_down_at) {
            $duration = $monitor->last_down_duration_seconds;
            $isOngoing = $monitor->current_status === 'down';
            $downStartedAt = $isOngoing
                ? ($monitor->last_status_changed_at ?: $monitor->last_down_at)
                : $monitor->last_down_at;
            if ($isOngoing) {
                $duration = max(0, now()->getTimestamp() - strtotime($downStartedAt));
            }
            $lastDowntime = [
                'started_at' => $downStartedAt,
                'duration_seconds' => $duration,
                'ongoing' => $isOngoing,
            ];
        }
        if (!$lastDowntime && $events->isNotEmpty()) {
            $downEvent = $events->firstWhere('status', 'down');
            if ($downEvent) {
                $recoveryEvent = $events->first(function ($event) use ($downEvent) {
                    return $event->status === 'up'
                        && $event->previous_status === 'down'
                        && strtotime($event->checked_at) > strtotime($downEvent->checked_at);
                });
                $ongoing = $monitor->current_status === 'down' || !$recoveryEvent;
                $lastDowntime = [
                    'started_at' => $downEvent->checked_at,
                    'duration_seconds' => $ongoing
                        ? max(0, now()->getTimestamp() - strtotime($downEvent->checked_at))
                        : ($recoveryEvent->down_duration_seconds
                            ?? max(0, strtotime($recoveryEvent->checked_at) - strtotime($downEvent->checked_at))),
                    'ongoing' => $ongoing,
                ];
            }
        }

        return [
            'monitor' => [
                'address' => $monitor->address,
                'notification_email' => $monitor->notification_email,
                'status' => $monitor->current_status,
                'check_interval_minutes' => (int) $monitor->check_interval_minutes,
                'is_active' => (bool) $monitor->is_active,
                'downtime_count' => (int) $monitor->downtime_count,
                'last_checked_at' => $monitor->last_checked_at,
                'last_status_changed_at' => $monitor->last_status_changed_at,
                'last_downtime' => $lastDowntime,
                'downtime_records' => array_reverse($downtimeRecords),
            ],
            'events' => $events,
        ];
    }

    private function validateAddress(string $address): array
    {
        $address = trim($address);
        if ($address === '') {
            throw ValidationException::withMessages([
                'address' => 'Enter a website address to check.',
            ]);
        }
        if (!preg_match('/^https?:\/\//i', $address)) {
            $scheme = preg_match('/^(localhost(?:\.|:|$)|127(?:\.|:)|\[::1\](?::|$)|::1(?::|$)|[^\/]+\.test(?::|\/|$))/i', $address)
                ? 'http://'
                : 'https://';
            $address = $scheme . $address;
        }

        $urlParts = parse_url($address);
        if (!is_array($urlParts)) {
            throw ValidationException::withMessages([
                'address' => 'Enter a valid HTTP or HTTPS website address.',
            ]);
        }

        $host = $urlParts['host'] ?? null;
        if (
            !$host
            || !in_array(strtolower($urlParts['scheme'] ?? ''), ['http', 'https'], true)
            || isset($urlParts['user'])
            || isset($urlParts['pass'])
            || strlen($address) > 2048
        ) {
            throw ValidationException::withMessages([
                'address' => 'Enter a valid HTTP or HTTPS website address without credentials.',
            ]);
        }

        $host = strtolower(rtrim($host, '.'));
        $isLocalHost = $this->isLocalHost($host);
        if (!$isLocalHost && !$this->isPublicTarget($host)) {
            throw ValidationException::withMessages([
                'address' => 'The address must resolve to a public website. Local or private network targets are not allowed.',
            ]);
        }
        if (!$isLocalHost && isset($urlParts['port']) && !in_array((int) $urlParts['port'], [80, 443], true)) {
            throw ValidationException::withMessages([
                'address' => 'Public website checks support standard HTTP and HTTPS ports only.',
            ]);
        }

        $scheme = strtolower($urlParts['scheme']);
        $formattedHost = str_contains($host, ':') ? '[' . $host . ']' : $host;
        $port = isset($urlParts['port'])
            && (int) $urlParts['port'] !== ($scheme === 'https' ? 443 : 80)
                ? ':' . (int) $urlParts['port']
                : '';
        $address = $scheme . '://' . $formattedHost . $port
            . ($urlParts['path'] ?? '')
            . (isset($urlParts['query']) ? '?' . $urlParts['query'] : '');

        return [
            $address,
            $urlParts,
            $host,
            $isLocalHost,
            !$isLocalHost && !filter_var($host, FILTER_VALIDATE_IP) && str_contains($host, '.'),
        ];
    }

    private function isPublicTarget(string $host): bool
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) !== false;
        }

        if (
            !str_contains($host, '.')
            || filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false
        ) {
            return false;
        }

        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if (!$records) {
            return false;
        }

        foreach ($records as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;
            if (
                !$ip
                || filter_var(
                    $ip,
                    FILTER_VALIDATE_IP,
                    FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
                ) === false
            ) {
                return false;
            }
        }

        return true;
    }

    private function getRegisteredDomain(string $host): string
    {
        $host = strtolower(rtrim($host, '.'));
        $parts = explode('.', $host);
        $count = count($parts);

        if ($count <= 2) {
            return $host;
        }

        $secondLevelTlds = [
            'co', 'com', 'net', 'org', 'edu', 'gov', 'ac', 'gen', 'firm', 'ind',
            'asn', 'id', 'ne', 'or', 'gr', 'lg', 'go', 'gob', 'gub', 'nom', 'in',
            'res', 'sch', 'ltd', 'plc', 'me', 'web', 're', 'pe', 'pub', 'fin',
            'k12', 'sc', 'govt', 'biz', 'info', 'pro', 'name'
        ];

        $lastPart = $parts[$count - 1];
        $secondLastPart = $parts[$count - 2];

        if (strlen($lastPart) === 2 && in_array($secondLastPart, $secondLevelTlds, true)) {
            return implode('.', array_slice($parts, -3));
        }

        return implode('.', array_slice($parts, -2));
    }

    private function getWhoisServerForTld(string $tld): string
    {
        $whoisServers = [
            'com' => 'whois.verisign-grs.com',
            'net' => 'whois.verisign-grs.com',
            'org' => 'whois.pir.org',
            'info' => 'whois.afilias.net',
            'biz' => 'whois.nic.biz',
            'io' => 'whois.nic.io',
            'co' => 'whois.nic.co',
            'us' => 'whois.nic.us',
            'uk' => 'whois.nic.uk',
            'in' => 'whois.registry.in',
            'ca' => 'whois.cira.ca',
            'de' => 'whois.denic.de',
            'eu' => 'whois.eu',
            'au' => 'whois.auda.org.au',
            'nl' => 'whois.domain-registry.nl',
            'be' => 'whois.dns.be',
            'ch' => 'whois.nic.ch',
            'at' => 'whois.nic.at',
            'fr' => 'whois.nic.fr',
            'it' => 'whois.nic.it',
            'se' => 'whois.iis.se',
            'no' => 'whois.norid.no',
            'fi' => 'whois.fi',
            'dk' => 'whois.dk-hostmaster.dk',
            'cz' => 'whois.nic.cz',
            'pl' => 'whois.dns.pl',
            'ru' => 'whois.tcinet.ru',
            'su' => 'whois.tcinet.ru',
            'br' => 'whois.registro.br',
            'mx' => 'whois.mx',
            'nz' => 'whois.srs.net.nz',
            'sg' => 'whois.sgnic.sg',
            'hk' => 'whois.hkirc.hk',
            'tw' => 'whois.twnic.net.tw',
            'jp' => 'whois.jprs.jp',
            'kr' => 'whois.kr',
            'za' => 'whois.registry.net.za',
            'dev' => 'whois.nic.google',
            'app' => 'whois.nic.google',
            'page' => 'whois.nic.google',
            'how' => 'whois.nic.google',
            'soy' => 'whois.nic.google',
            'google' => 'whois.nic.google',
            'ai' => 'whois.nic.ai',
            'me' => 'whois.nic.me',
            'xyz' => 'whois.nic.xyz',
            'site' => 'whois.nic.site',
            'online' => 'whois.nic.online',
            'tech' => 'whois.nic.tech',
            'store' => 'whois.nic.store',
            'club' => 'whois.nic.club',
            'top' => 'whois.nic.top',
            'vip' => 'whois.nic.vip',
            'cloud' => 'whois.nic.cloud',
        ];

        if (isset($whoisServers[$tld])) {
            return $whoisServers[$tld];
        }

        $ianaResponse = $this->queryWhoisServer('whois.iana.org', $tld, 3);
        if ($ianaResponse && preg_match('/(?:refer|whois):\s*([a-z0-9\.\-]+)/i', $ianaResponse, $ianaMatches)) {
            return strtolower(trim($ianaMatches[1]));
        }

        return 'whois.nic.' . $tld;
    }

    private function queryWhoisServer(string $server, string $query, int $timeout = 4): ?string
    {
        $socket = @stream_socket_client(
            'tcp://' . $server . ':43',
            $errorCode,
            $errorMessage,
            $timeout,
            STREAM_CLIENT_CONNECT
        );

        if (!is_resource($socket)) {
            return null;
        }

        try {
            stream_set_timeout($socket, $timeout);
            if (fwrite($socket, $query . "\r\n") === false) {
                return null;
            }

            $response = '';
            while (!feof($socket) && strlen($response) < 1048576) {
                $line = fgets($socket, 4096);
                if ($line === false) {
                    break;
                }
                $response .= $line;
            }

            $meta = stream_get_meta_data($socket);
            if (!empty($meta['timed_out'])) {
                return null;
            }

            return $response;
        } catch (Throwable $e) {
            return null;
        } finally {
            if (is_resource($socket)) {
                fclose($socket);
            }
        }
    }

    private function parseExpiryDateFromWhois(string $whoisData): ?int
    {
        $expiryPatterns = [
            '/Registrar Registration Expiration Date:\s*(.+)/i',
            '/Registry Expiry Date:\s*(.+)/i',
            '/Expiration Date:\s*(.+)/i',
            '/Expiry Date:\s*(.+)/i',
            '/Expiry date:\s*(.+)/i',
            '/Expiration Time:\s*(.+)/i',
            '/Expiration time:\s*(.+)/i',
            '/Renewal Date:\s*(.+)/i',
            '/Renewal date:\s*(.+)/i',
            '/paid-till:\s*(.+)/i',
            '/valid-until:\s*(.+)/i',
            '/expires:\s*(.+)/i',
            '/expire:\s*(.+)/i',
            '/Expire Date:\s*(.+)/i',
            '/Record expires on:\s*(.+)/i',
            '/Record expires on\s*(.+)/i',
            '/Domain Expiration Date:\s*(.+)/i',
            '/Domain Expires:\s*(.+)/i',
            '/domain_dateExpiry:\s*(.+)/i',
            '/Domain Valid Until:\s*(.+)/i',
            '/paid-till\s*:\s*(.+)/i',
            '/expires on\s*:\s*(.+)/i',
            '/expires on\s+(.+)/i',
            '/expire-date:\s*(.+)/i',
        ];

        foreach ($expiryPatterns as $pattern) {
            if (!preg_match($pattern, $whoisData, $matches)) {
                continue;
            }

            $rawDate = trim($matches[1]);
            $rawDate = preg_replace('/\s*[\(\[\{].*?[\)\]\}]/', '', $rawDate);
            $rawDate = trim($rawDate);

            if (preg_match('/^\d{4}\.\d{2}\.\d{2}$/', $rawDate)) {
                $rawDate = str_replace('.', '-', $rawDate);
            }

            $timestamp = strtotime($rawDate);
            if ($timestamp !== false && $timestamp > 0) {
                return $timestamp;
            }

            try {
                $carbon = Carbon::parse($rawDate);
                if ($carbon->timestamp > 0) {
                    return $carbon->timestamp;
                }
            } catch (Throwable $e) {
                // continue matching next pattern
            }
        }

        return null;
    }

    private function getDomainExpiry(string $host): array
    {
        $host = strtolower(rtrim($host, '.'));
        $parts = explode('.', $host);
        $candidates = [$this->getRegisteredDomain($host)];

        for ($index = count($parts) - 2; $index >= 0; $index--) {
            $candidates[] = implode('.', array_slice($parts, $index));
        }

        $candidates = array_slice(array_values(array_unique($candidates)), 0, 4);
        foreach ($candidates as $domain) {
            $expiry = $this->getRdapDomainExpiry($domain);
            if ($expiry !== null) {
                return $expiry;
            }
        }

        $whoisServerUsed = null;
        foreach ($candidates as $domain) {
            $tldSeparator = strrpos($domain, '.');
            if ($tldSeparator === false || $tldSeparator === strlen($domain) - 1) {
                continue;
            }

            $tld = strtolower(substr($domain, $tldSeparator + 1));
            $whoisServer = $this->getWhoisServerForTld($tld);
            $whoisServerUsed = $whoisServer;
            $query = $domain;

            if ($whoisServer === 'whois.verisign-grs.com') {
                $query = '=' . $domain;
            } elseif ($whoisServer === 'whois.denic.de') {
                $query = '-T dn,ace ' . $domain;
            } elseif ($whoisServer === 'whois.jprs.jp') {
                $query = 'DOM ' . $domain . '/e';
            }

            $whoisData = $this->queryWhoisServer($whoisServer, $query);
            if (!$whoisData) {
                continue;
            }

            $expiryTimestamp = $this->parseExpiryDateFromWhois($whoisData);
            if (
                $expiryTimestamp === null
                && preg_match('/Registrar WHOIS Server:\s*([a-z0-9\.\-]+)/i', $whoisData, $registrarMatches)
            ) {
                $registrarServer = strtolower(trim($registrarMatches[1]));
                if ($registrarServer !== $whoisServer) {
                    $registrarData = $this->queryWhoisServer($registrarServer, $domain);
                    if ($registrarData) {
                        $expiryTimestamp = $this->parseExpiryDateFromWhois($registrarData);
                        if ($expiryTimestamp !== null) {
                            $whoisServer = $registrarServer;
                        }
                    }
                }
            }

            if ($expiryTimestamp !== null) {
                return $this->formatDomainExpiry($expiryTimestamp, 'whois', $whoisServer);
            }
        }

        return [
            'status' => 'unknown',
            'whois_server' => $whoisServerUsed,
            'message' => 'No expiration date was published by RDAP or the available WHOIS registry.',
        ];
    }

    private function getRdapDomainExpiry(string $domain): ?array
    {
        try {
            $options = [
                'allow_redirects' => ['max' => 5, 'strict' => true],
                'http_errors' => false,
            ];
            $caBundle = $this->getCaBundlePath();
            if ($caBundle !== null) {
                $options['verify'] = $caBundle;
            }

            $response = Http::withHeaders([
                'Accept' => 'application/rdap+json, application/json',
            ])
                ->timeout(6)
                ->withOptions($options)
                ->withUserAgent('Mozilla/5.0 (Domain Expiry Checker)')
                ->get('https://rdap.org/domain/' . rawurlencode($domain));

            if ($response->status() !== 200) {
                return null;
            }

            $rdapData = json_decode($response->body(), true);
            $events = is_array($rdapData) ? ($rdapData['events'] ?? []) : [];
            if (!is_array($events)) {
                return null;
            }

            foreach ($events as $event) {
                if (
                    !is_array($event)
                    || strtolower($event['eventAction'] ?? '') !== 'expiration'
                    || empty($event['eventDate'])
                ) {
                    continue;
                }

                return $this->formatDomainExpiry(
                    Carbon::parse($event['eventDate'])->timestamp,
                    'rdap'
                );
            }
        } catch (Throwable $exception) {
            report($exception);
        }

        return null;
    }

    private function getCaBundlePath(): ?string
    {
        $configuredPath = ini_get('curl.cainfo');
        if (is_string($configuredPath) && $configuredPath !== '' && is_file($configuredPath)) {
            return $configuredPath;
        }

        $bundlePath = base_path('vendor/rmccue/requests/certificates/cacert.pem');

        return is_file($bundlePath) && is_readable($bundlePath) ? $bundlePath : null;
    }

    private function formatDomainExpiry(int $expiryTimestamp, string $source, ?string $whoisServer = null): array
    {
        $secondsRemaining = $expiryTimestamp - time();
        $daysRemaining = (int) ceil($secondsRemaining / 86400);
        $hasExpired = $daysRemaining <= 0;
        $expiresAt = Carbon::createFromTimestamp($expiryTimestamp);

        return [
            'status' => $hasExpired ? 'expired' : 'valid',
            'source' => $source,
            'whois_server' => $whoisServer,
            'expires_at' => $expiresAt->toIso8601String(),
            'expiry_date' => $expiresAt->format('Y-m-d H:i:s'),
            'days_remaining' => $daysRemaining,
            'has_expired' => $hasExpired,
        ];
    }

    private function getSslValidity(string $host, int $port = 443): array
    {
        $socket = null;

        try {
            $context = stream_context_create([
                'ssl' => [
                    'capture_peer_cert' => true,
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                    'peer_name' => $host,
                    'SNI_enabled' => true,
                ],
            ]);

            $socket = stream_socket_client(
                'ssl://' . (str_contains($host, ':') ? '[' . $host . ']' : $host) . ':' . $port,
                $errorCode,
                $errorMessage,
                5,
                STREAM_CLIENT_CONNECT,
                $context
            );

            if (!$socket) {
                return [
                    'status' => 'unknown',
                    'message' => $errorMessage ?: 'Could not connect to the website SSL service.',
                ];
            }

            $parameters = stream_context_get_params($socket);
            $certificate = $parameters['options']['ssl']['peer_certificate'] ?? null;
            $certificateData = $certificate ? openssl_x509_parse($certificate) : false;
            if (
                !$certificateData
                || !isset($certificateData['validFrom_time_t'], $certificateData['validTo_time_t'])
            ) {
                return [
                    'status' => 'unknown',
                    'message' => 'The SSL certificate validity dates could not be read.',
                ];
            }

            $validFrom = Carbon::createFromTimestamp($certificateData['validFrom_time_t']);
            $expiresAt = Carbon::createFromTimestamp($certificateData['validTo_time_t']);
            $currentTimestamp = time();
            $isWithinValidityPeriod = $currentTimestamp >= $certificateData['validFrom_time_t']
                && $currentTimestamp <= $certificateData['validTo_time_t'];
            $matchesHost = $this->certificateMatchesHost($certificate, $certificateData, $host);
            $isValid = $isWithinValidityPeriod && $matchesHost;
            $issuer = $certificateData['issuer']['CN']
                ?? $certificateData['issuer']['O']
                ?? null;

            return [
                'status' => $currentTimestamp > $certificateData['validTo_time_t']
                    ? 'expired'
                    : ($isValid ? 'valid' : 'invalid'),
                'is_valid' => $isValid,
                'message' => !$matchesHost
                    ? 'The SSL certificate does not match this website address.'
                    : (!$isWithinValidityPeriod ? 'The SSL certificate is outside its validity period.' : null),
                'valid_from' => $validFrom->toIso8601String(),
                'expires_at' => $expiresAt->toIso8601String(),
                'days_remaining' => (int) round(
                    ($certificateData['validTo_time_t'] - $currentTimestamp) / 86400
                ),
                'issuer' => is_string($issuer) ? $issuer : null,
            ];
        } catch (Throwable $exception) {
            report($exception);

            return [
                'status' => 'invalid',
                'message' => 'The SSL certificate could not be verified.',
            ];
        } finally {
            if (is_resource($socket)) {
                fclose($socket);
            }
        }
    }

    private function certificateMatchesHost($certificate, array $certificateData, string $host): bool
    {
        if (function_exists('openssl_x509_check_host')) {
            return openssl_x509_check_host($certificate, $host);
        }

        $subjectAltName = $certificateData['extensions']['subjectAltName'] ?? '';
        preg_match_all('/(?:^|,\s*)DNS:([^,\s]+)/i', $subjectAltName, $matches);
        $dnsNames = $matches[1] ?? [];

        if (!$dnsNames && trim($subjectAltName) === '') {
            $commonName = $certificateData['subject']['CN'] ?? null;
            $dnsNames = is_array($commonName) ? $commonName : [$commonName];
        }

        foreach ($dnsNames as $dnsName) {
            if (!is_string($dnsName)) {
                continue;
            }

            $dnsName = strtolower(rtrim($dnsName, '.'));
            if ($dnsName === strtolower(rtrim($host, '.'))) {
                return true;
            }

            if (
                str_starts_with($dnsName, '*.')
                && str_ends_with(strtolower(rtrim($host, '.')), substr($dnsName, 1))
            ) {
                $hostPrefix = substr(strtolower(rtrim($host, '.')), 0, -strlen(substr($dnsName, 1)));
                if ($hostPrefix !== '' && !str_contains(rtrim($hostPrefix, '.'), '.')) {
                    return true;
                }
            }
        }

        return false;
    }

    private function getUptime(array $urlParts, string $host, Request $request): array
    {
        if ($this->isLocalHost($host)) {
            $scheme = strtolower($urlParts['scheme'] ?? 'http');
            $targetPort = (int) ($urlParts['port'] ?? ($scheme === 'https' ? 443 : 80));
            $requestPort = (int) $request->getPort();
            $sameHost = strtolower($request->getHost()) === $host;

            if ($sameHost && $targetPort === $requestPort) {
                $uptime = [
                    'status' => 'up',
                    'http_status' => 200,
                ];

                $startedAt = $this->getLocalServerStartedAt();
                if ($startedAt !== null) {
                    $uptime['running_since'] = $startedAt;
                } else {
                    $uptime['message'] = 'The server is responding, but its process start time could not be determined.';
                }

                return $uptime;
            }

            $socket = @fsockopen(
                str_contains($host, ':') ? '[' . $host . ']' : $host,
                $targetPort,
                $errorCode,
                $errorMessage,
                3
            );

            if (!$socket) {
                return [
                    'status' => 'down',
                    'message' => $errorMessage ?: 'No local web server is listening on this address and port.',
                ];
            }

            fclose($socket);
            return [
                'status' => 'up',
                'message' => 'The local web server is accepting connections.',
            ];
        }

        try {
            $scheme = $urlParts['scheme'] ?? 'https';
            $port = isset($urlParts['port']) ? ':' . $urlParts['port'] : '';
            $path = trim($urlParts['path'] ?? '', '/');
            $query = isset($urlParts['query']) ? '?' . $urlParts['query'] : '';
            $urlHost = str_contains($host, ':') ? '[' . $host . ']' : $host;
            $url = $scheme . '://' . $urlHost . $port
                . ($path ? '/' . $path : '')
                . $query;

            $response = Http::timeout(8)
                ->withOptions(['allow_redirects' => false])
                ->get($url);

            $statusCode = $response->status();

            return [
                'status' => 'up',
                'http_status' => $statusCode,
                'message' => $statusCode >= 200 && $statusCode < 400
                    ? 'The website responded; the remote server process start time is unavailable.'
                    : "The website responded with HTTP {$statusCode}; application-level health may need attention.",
            ];
        } catch (Throwable $exception) {
            $scheme = strtolower($urlParts['scheme'] ?? 'https');
            $port = (int) ($urlParts['port'] ?? ($scheme === 'https' ? 443 : 80));
            $socket = @fsockopen(
                str_contains($host, ':') ? '[' . $host . ']' : $host,
                $port,
                $socketErrorCode,
                $socketErrorMessage,
                3
            );

            if (is_resource($socket)) {
                fclose($socket);

                return [
                    'status' => 'up',
                    'message' => 'The website responded',
                ];
            }

            report($exception);

            return [
                'status' => 'down',
                'message' => 'The website did not respond to the live availability check.',
            ];
        }
    }

    private function isLocalHost(string $host): bool
    {
        $host = strtolower(rtrim($host, '.'));

        if (
            $host === 'localhost'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.test')
        ) {
            return true;
        }

        $packedAddress = @inet_pton($host);
        if ($packedAddress === false) {
            return false;
        }

        return (strlen($packedAddress) === 4 && ord($packedAddress[0]) === 127)
            || (strlen($packedAddress) === 16 && $packedAddress === str_repeat("\0", 15) . "\1");
    }

    private function getLocalServerStartedAt(): ?string
    {
        if (PHP_OS_FAMILY !== 'Windows' || !function_exists('proc_open')) {
            return null;
        }

        $processId = getmypid();
        if (!$processId) {
            return null;
        }

        $command = [
            'powershell.exe',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '$process = Get-Process -Id ' . (int) $processId . ' -ErrorAction Stop; $process.StartTime.ToUniversalTime().ToString("o")',
        ];
        $pipes = [];
        $process = proc_open($command, [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        if (!is_resource($process)) {
            return null;
        }

        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $output = '';
        $errorOutput = '';
        $deadline = microtime(true) + 3;
        $processStatus = ['running' => true, 'exitcode' => -1];

        do {
            $output .= stream_get_contents($pipes[1]);
            $errorOutput .= stream_get_contents($pipes[2]);
            $processStatus = proc_get_status($process);

            if (!$processStatus['running']) {
                break;
            }

            usleep(50000);
        } while (microtime(true) < $deadline);

        if ($processStatus['running']) {
            proc_terminate($process);
        }

        $output .= stream_get_contents($pipes[1]);
        $errorOutput .= stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $closeCode = proc_close($process);

        $startedAt = trim($output);
        $exitCode = $processStatus['exitcode'] >= 0
            ? $processStatus['exitcode']
            : $closeCode;
        if ($processStatus['running'] || $exitCode !== 0 || $startedAt === '') {
            report(new \RuntimeException(
                'Unable to determine the local web server process start time: ' . trim($errorOutput)
            ));

            return null;
        }

        try {
            return Carbon::parse($startedAt)->toIso8601String();
        } catch (Throwable $exception) {
            report($exception);

            return null;
        }
    }
}

