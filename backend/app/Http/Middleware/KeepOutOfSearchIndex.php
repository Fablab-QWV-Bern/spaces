<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Asks search engines to neither index nor follow anything this application
 * answers. The anonymous role may view bookings, so without it Google renders
 * the calendar as a guest sees it — and the widgets page by day through plain
 * links, which is an endless supply of URLs to a crawler that found them in
 * an embed on the workshop's own site.
 *
 * A header rather than only a meta tag, because it also covers what is not
 * HTML: the iCal feed, JSON, the widgets' manifest. Global rather than in the
 * web group, so that 404s and error pages carry it too.
 *
 * It only works while crawling is allowed: a robots.txt with `Disallow: /`
 * would keep Google from ever seeing this header, and URLs already in the
 * index would stay there, merely without a description.
 */
class KeepOutOfSearchIndex
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set('X-Robots-Tag', 'noindex, nofollow');

        return $response;
    }
}
