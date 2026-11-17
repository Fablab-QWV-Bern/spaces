<?php

// Every kind of response the application gives — SPA fallback, widgets, API,
// errors — has to ask search engines to stay away. See KeepOutOfSearchIndex.

it('keeps every kind of response out of the search index', function (string $path): void {
    $this->get($path)->assertHeader('X-Robots-Tag', 'noindex, nofollow');
})->with([
    'interface' => '/woche',
    'agenda widget' => '/agenda',
    'list widget' => '/liste',
    'api' => '/api/session',
    'api 404' => '/api/gibtesnicht',
]);
