<?php

namespace App\Console\Commands;

use App\Support\DatabaseDump;
use Illuminate\Console\Command;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Writes a gzipped dump of the database to the `backups` disk and drops the
 * dumps older than KEEP_DAYS.
 *
 * On the hosting this runs as its own Plesk scheduled task, not behind
 * `schedule:run`: Laravel's scheduler reports a command's exception through the
 * exception handler and still exits 0, so Plesk's "notify on error" would never
 * see a backup that produced nothing. A non-zero exit from this command does
 * reach it.
 *
 * The dump is written under a `.tmp` name and moved into place only once
 * mysqldump has exited cleanly — a half-written file must never look like a good
 * backup, neither to the retention sweep nor to whoever reaches for one.
 */
class BackupDatabase extends Command
{
    protected $signature = 'backup:db';

    protected $description = 'Dumps the database to the backups disk, gzip-compressed, and prunes old dumps';

    /** How many days of dumps to keep. Changing retention is a code change on purpose. */
    private const KEEP_DAYS = 30;

    public function handle(DatabaseDump $dump): int
    {
        $disk = Storage::disk('backups');
        File::ensureDirectoryExists($disk->path(''));

        $name = 'db-'.now()->format('Y-m-d-His').'.sql.gz';
        $tmp = $disk->path($name.'.tmp');

        try {
            $dump->writeTo($tmp);
        } catch (Throwable $e) {
            File::delete($tmp);
            $this->error('Backup failed: '.$e->getMessage());

            return self::FAILURE;
        }

        rename($tmp, $disk->path($name));
        $this->pruneOldDumps($disk);

        $this->info(sprintf('Backup written: %s (%s)', $name, $this->humanSize($disk->size($name))));

        return self::SUCCESS;
    }

    private function pruneOldDumps(Filesystem $disk): void
    {
        $cutoff = now()->subDays(self::KEEP_DAYS)->getTimestamp();

        foreach ($disk->files() as $file) {
            if (preg_match('/^db-.*\.sql\.gz$/', $file) && $disk->lastModified($file) < $cutoff) {
                $disk->delete($file);
                $this->line('Pruned '.$file);
            }
        }
    }

    private function humanSize(int $bytes): string
    {
        foreach (['B', 'KB', 'MB', 'GB'] as $unit) {
            if ($bytes < 1024) {
                return round($bytes, 1).' '.$unit;
            }
            $bytes /= 1024;
        }

        return round($bytes, 1).' TB';
    }
}
