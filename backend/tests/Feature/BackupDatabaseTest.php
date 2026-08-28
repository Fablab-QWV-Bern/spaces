<?php

use App\Support\DatabaseDump;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    Storage::fake('backups');
    $this->freezeTime();
});

/**
 * Stands in for the real mysqldump call. Without a behaviour it writes a fixed
 * gzipped payload, the way a clean dump would; with one it does whatever the
 * test needs (leave a partial file, throw).
 */
function fakeDump(?callable $behaviour = null): void
{
    app()->bind(DatabaseDump::class, fn () => new class($behaviour) extends DatabaseDump
    {
        public function __construct(private $behaviour) {}

        public function writeTo(string $target): void
        {
            if ($this->behaviour) {
                ($this->behaviour)($target);

                return;
            }

            file_put_contents($target, gzencode('-- fake dump'));
        }
    });
}

function dumpFiles(): Collection
{
    return collect(Storage::disk('backups')->files())
        ->filter(fn ($f) => preg_match('/^db-\d{4}-\d{2}-\d{2}-\d{6}\.sql\.gz$/', $f))
        ->values();
}

it('writes one gzipped archive that decompresses to the dump output', function () {
    fakeDump();

    $this->artisan('backup:db')->assertSuccessful();

    expect(dumpFiles())->toHaveCount(1);

    $disk = Storage::disk('backups');
    expect(gzdecode($disk->get(dumpFiles()->first())))->toBe('-- fake dump');
    // the .tmp name is gone once the archive is in place
    expect($disk->exists(dumpFiles()->first().'.tmp'))->toBeFalse();
});

it('prunes archives older than the retention window and leaves everything else', function () {
    fakeDump();
    $disk = Storage::disk('backups');

    $disk->put('db-2000-01-01-000000.sql.gz', 'old');
    $disk->put('db-2026-08-01-000000.sql.gz', 'young');
    $disk->put('notes.txt', 'not ours');
    touch($disk->path('db-2000-01-01-000000.sql.gz'), now()->subDays(40)->getTimestamp());
    touch($disk->path('db-2026-08-01-000000.sql.gz'), now()->subDays(10)->getTimestamp());

    $this->artisan('backup:db')->assertSuccessful();

    expect($disk->exists('db-2000-01-01-000000.sql.gz'))->toBeFalse();
    expect($disk->exists('db-2026-08-01-000000.sql.gz'))->toBeTrue();
    expect($disk->exists('notes.txt'))->toBeTrue();
    // the young one plus the one this run just wrote
    expect(dumpFiles())->toHaveCount(2);
});

it('fails and leaves no archive behind when the dump errors', function () {
    fakeDump(function (string $target) {
        file_put_contents($target, 'half a dump');
        throw new RuntimeException('mysqldump exited with 2: Access denied for user');
    });

    $this->artisan('backup:db')
        ->assertFailed()
        ->expectsOutputToContain('Access denied for user');

    expect(Storage::disk('backups')->allFiles())->toBeEmpty();
});
