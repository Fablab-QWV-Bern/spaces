<?php

return [
    'default' => env('SPEC_SOURCE', 'local'),

    'sources' => [
        'local' => [
            'source' => 'local',
            // Die API-Spec liegt neben dem Backend im Repo, nicht darin.
            'base_path' => env('SPEC_PATH', dirname(__DIR__, 2).'/spec'),
        ],
    ],

    'path_prefix' => '/api',

    'error_format' => env('SPECTATOR_ERROR_FORMAT', 'text'),

    // Unsere API-Routen laufen in der web-Gruppe (Session-Cookie, CSRF), nicht in
    // der zustandslosen api-Gruppe — dort muss die Middleware also greifen.
    'middleware_groups' => ['web'],
];
