<?php

namespace App\Support;

use RuntimeException;
use Symfony\Component\Process\Process;

/**
 * A gzip-compressed `mysqldump` of the default database connection, streamed to
 * a file.
 *
 * Streamed, not buffered: the dump goes into the gzip handle as it arrives from
 * the process, so a large database never sits in memory in one piece. The
 * password travels in the environment (`MYSQL_PWD`) rather than in argv, so it
 * does not appear in a process listing.
 *
 * A missing binary or a non-zero exit throws; the caller decides what a failed
 * dump means. The partially written target is left for the caller to clean up.
 */
class DatabaseDump
{
    public function writeTo(string $target): void
    {
        $connection = config('database.connections.'.config('database.default'));

        $handle = gzopen($target, 'wb6');
        if ($handle === false) {
            throw new RuntimeException("Cannot open {$target} for writing.");
        }

        $stderr = '';
        $process = new Process([
            config('backup.mysqldump_path'),
            '--host='.($connection['host'] ?? '127.0.0.1'),
            '--port='.($connection['port'] ?? 3306),
            '--user='.$connection['username'],
            // A consistent snapshot without locking anyone out of the tables.
            '--single-transaction',
            '--skip-lock-tables',
            // Avoids the PROCESS privilege the hosting's database user may lack.
            '--no-tablespaces',
            '--default-character-set='.($connection['charset'] ?? 'utf8mb4'),
            $connection['database'],
        ], base_path(), ['MYSQL_PWD' => (string) $connection['password']]);

        $process->setTimeout(600);

        try {
            $process->run(function (string $type, string $chunk) use ($handle, &$stderr): void {
                if ($type === Process::OUT) {
                    gzwrite($handle, $chunk);
                } else {
                    $stderr .= $chunk;
                }
            });
        } finally {
            gzclose($handle);
        }

        if (! $process->isSuccessful()) {
            throw new RuntimeException(sprintf(
                'mysqldump exited with %d: %s',
                (int) $process->getExitCode(),
                trim($stderr) ?: 'no error output',
            ));
        }
    }
}
