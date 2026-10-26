<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Throwable;

class WebsiteAvailabilityChecker
{
    public function check(string $address): array
    {
        $parts = parse_url($address);
        $host = is_array($parts) ? ($parts['host'] ?? null) : null;
        if (!$host || !$this->isSafeTarget($host)) {
            return [
                'status' => 'down',
                'message' => 'The address no longer resolves to a public website.',
            ];
        }

        $scheme = strtolower($parts['scheme'] ?? 'https');
        $portNumber = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
        $port = isset($parts['port']) ? ':' . $portNumber : '';
        $path = $parts['path'] ?? '';
        $query = isset($parts['query']) ? '?' . $parts['query'] : '';
        $urlHost = str_contains($host, ':') ? '[' . $host . ']' : $host;
        $url = $scheme . '://' . $urlHost . $port . $path . $query;

        try {
            $response = Http::timeout(8)
                ->withOptions(['allow_redirects' => false])
                ->get($url);

            return [
                'status' => 'up',
                'http_status' => $response->status(),
                'message' => $response->status() >= 200 && $response->status() < 400
                    ? 'Website responded to the scheduled check.'
                    : 'Website responded with HTTP ' . $response->status() . '.',
            ];
        } catch (Throwable $exception) {
            $socket = @fsockopen(
                str_contains($host, ':') ? '[' . $host . ']' : $host,
                $portNumber,
                $errorCode,
                $errorMessage,
                3
            );

            if (is_resource($socket)) {
                fclose($socket);

                return [
                    'status' => 'up',
                    'message' => 'Website port is reachable, but the HTTP check could not complete.',
                ];
            }

            return [
                'status' => 'down',
                'message' => $errorMessage ?: 'The website did not respond to the scheduled check.',
            ];
        }
    }

    private function isSafeTarget(string $host): bool
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
        if ($packedAddress !== false) {
            $isIpv4Loopback = strlen($packedAddress) === 4
                && ord($packedAddress[0]) === 127;
            $isIpv6Loopback = strlen($packedAddress) === 16
                && $packedAddress === str_repeat("\0", 15) . "\1";

            if ($isIpv4Loopback || $isIpv6Loopback) {
                return true;
            }
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return filter_var(
                $host,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            ) !== false;
        }

        if (filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false) {
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
}
