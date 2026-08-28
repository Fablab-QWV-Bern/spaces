<?php

// Not spatie/laravel-backup — just the one knob `backup:db` needs. Retention
// lives in the command as a constant; changing how many days to keep is a code
// change on purpose. Only the mysqldump path may have to differ per host, and
// `artisan optimize` caches config, so the command cannot read a bare env()
// itself — hence a file.
return [

    // A bare name is looked up on PATH. Set MYSQLDUMP_PATH to an absolute path
    // on a host where a Plesk scheduled task does not have `mysqldump` on its
    // PATH (untested on the hosting, see CLAUDE.md).
    'mysqldump_path' => env('MYSQLDUMP_PATH', 'mysqldump'),

];
