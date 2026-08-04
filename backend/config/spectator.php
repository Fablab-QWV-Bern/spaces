<?php

return [
    'default' => env('SPEC_SOURCE', 'local'),

    'sources' => [
        'local' => [
            'source' => 'local',
            // The API spec sits next to the backend in the repo, not inside it.
            'base_path' => env('SPEC_PATH', dirname(__DIR__, 2).'/spec'),
        ],
    ],

    'path_prefix' => '/api',

    'error_format' => env('SPECTATOR_ERROR_FORMAT', 'text'),

    // Our API routes run in the web group (session cookie, CSRF), not in the
    // stateless api group — so the middleware has to take effect there.
    'middleware_groups' => ['web'],
];
