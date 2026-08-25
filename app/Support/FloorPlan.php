<?php

namespace App\Support;

use DOMAttr;
use DOMDocument;
use DOMElement;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * The floor plan the overview map is drawn from: where it lies, and what an
 * uploaded one has to survive before it is stored.
 *
 * The plan is a file rather than data, and it stays one — nothing about it is
 * modelled, there is no row and no id. What it can be now is *replaced*, and
 * that changes where it lies: an uploaded plan goes on the `public` disk, while
 * the one that came with the interface stays a static asset next to the SPA. A
 * fresh installation therefore has a map without anyone having uploaded
 * anything, and whoever rearranges the workshop no longer needs a deployment.
 */
class FloorPlan
{
    /** On the `public` disk, so that the web server delivers it without PHP. */
    public const PATH = 'karte.svg';

    /** The plan that ships with the interface, next to `index.html`. */
    public const SHIPPED_URL = '/karte.svg';

    /** At most; the shipped plan is 330 kB, and a drawing tool's export grows. */
    public const MAX_KILOBYTES = 5120;

    /**
     * Which plan is in use, as the API reports it.
     *
     * @return array{url: string, isDefault: bool, updatedAt: ?string}
     */
    public static function state(): array
    {
        $disk = Storage::disk('public');

        if (! $disk->exists(self::PATH)) {
            return ['url' => self::SHIPPED_URL, 'isDefault' => true, 'updatedAt' => null];
        }

        return [
            // Without scheme and host, like every URL this API hands out: an
            // absolute one would come from APP_URL, and a misconfigured APP_URL
            // on the hosting would take the map down with it.
            'url' => parse_url($disk->url(self::PATH), PHP_URL_PATH),
            'isDefault' => false,
            'updatedAt' => gmdate('Y-m-d\TH:i:s\Z', $disk->lastModified(self::PATH)),
        ];
    }

    /**
     * Stores an uploaded plan, stripped.
     *
     * @return string|null the reason it was rejected, or null when it was stored
     */
    public static function store(UploadedFile $file): ?string
    {
        $svg = self::clean((string) file_get_contents($file->getRealPath()));

        if ($svg === null) {
            return 'Die Datei ist kein lesbares SVG.';
        }

        Storage::disk('public')->put(self::PATH, $svg);

        return null;
    }

    /** Back to the shipped plan. Deleting what is not there is not an error. */
    public static function forget(): void
    {
        Storage::disk('public')->delete(self::PATH);
    }

    /**
     * Reads the plan and hands back what is safe to keep, or null if it is no
     * SVG at all.
     *
     * This is not the usual caution around an upload. A photo used to end up in
     * an `<img>`, where a browser treats the file as pixels; the plan is parsed
     * by the interface and grafted into its own document, so everything in it
     * runs in the application's origin — which is exactly what the map needs, in
     * order to reach the workplaces' identifiers at all. So what an `<img>`
     * would have made harmless has to be removed here instead. Whoever may
     * upload a plan may already manage workplaces, so this is not a wall against
     * an attacker with the password; it is one against a file that arrives from
     * a drawing tool, an export service or a mailbox with something else in it.
     *
     * What goes is what can act: scripts, event handlers, the foreign objects
     * through which HTML would come back in, and every reference that leads off
     * the document. What stays is the drawing, with its ids and its layers —
     * the contract the map reads.
     */
    private static function clean(string $source): ?string
    {
        $document = new DOMDocument;

        $previous = libxml_use_internal_errors(true);

        // No LIBXML_NOENT: entities stay unexpanded, so a document that defines
        // itself a million times over stays a few hundred bytes. LIBXML_NONET
        // says the parser may not fetch anything it is pointed at.
        $parsed = $document->loadXML($source, LIBXML_NONET);

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $parsed || $document->documentElement === null) {
            return null;
        }

        // The doctype is where a document can define itself a million times
        // over, so one that brings its own entities along is refused rather than
        // cleaned. The bare `<!DOCTYPE svg PUBLIC …>` that every drawing tool
        // writes is not that — it points at a DTD on the W3C's server that is
        // never fetched (no LIBXML_DTDLOAD, and LIBXML_NONET on top). It is
        // dropped all the same: nothing here needs it, and the plan is served as
        // a file rather than validated.
        $doctype = $document->doctype;

        if ($doctype !== null) {
            if ($doctype->internalSubset !== null || $doctype->entities->length > 0) {
                return null;
            }

            $document->removeChild($doctype);
        }

        if ($document->documentElement->localName !== 'svg') {
            return null;
        }

        self::strip($document->documentElement);

        // Without this the declaration says nothing about the encoding, and
        // libxml plays it safe by writing every umlaut as a numeric entity. The
        // ids survive that — a parser resolves them again — but a plan one can
        // read in an editor is worth more than one whose layer is called
        // `Arbeitspl&#xE4;tze`.
        $document->encoding = 'UTF-8';

        return $document->saveXML();
    }

    /** Elements that can act, or that let something else act. */
    private const FORBIDDEN = [
        'script', 'foreignobject', 'iframe', 'embed', 'object',
        'audio', 'video', 'handler', 'set', 'animate', 'animatetransform',
    ];

    private static function strip(DOMElement $element): void
    {
        // Backwards, because removing a child shortens the live list underneath
        // an ascending loop and every second element would be skipped.
        for ($i = $element->childNodes->length - 1; $i >= 0; $i--) {
            $child = $element->childNodes->item($i);

            if (! $child instanceof DOMElement) {
                continue;
            }

            if (in_array(strtolower($child->localName), self::FORBIDDEN, true)) {
                $element->removeChild($child);

                continue;
            }

            // A stylesheet cannot act, but it can fetch: `@import` and a `url()`
            // with a scheme in front of it are requests to somewhere else, and
            // they would go out in the application's name. A plan that needs
            // them is not one the map can use anyway — everything it draws is
            // in the file.
            if (strtolower($child->localName) === 'style' && self::fetches($child->textContent)) {
                $element->removeChild($child);

                continue;
            }

            self::strip($child);
        }

        foreach (iterator_to_array($element->attributes) as $attribute) {
            /** @var DOMAttr $attribute */
            if (! self::keeps($attribute)) {
                $element->removeAttributeNode($attribute);
            }
        }
    }

    /** Whether a piece of CSS would send a request off the document. */
    private static function fetches(string $css): bool
    {
        $lowered = strtolower($css);

        return str_contains($lowered, '@import')
            || str_contains($lowered, 'javascript:')
            || (bool) preg_match('/url\(\s*[\'"]?(?!#)/i', $lowered);
    }

    private static function keeps(DOMAttr $attribute): bool
    {
        $name = strtolower($attribute->localName);
        $value = trim($attribute->value);

        // `onload`, `onclick` and the rest of them.
        if (str_starts_with($name, 'on')) {
            return false;
        }

        // A reference is allowed to point inside the document and nowhere else.
        // That is all the plan does — `<use href="#figur">` — and it is what
        // keeps an upload from fetching anything when it is displayed.
        if ($name === 'href' || $name === 'xlink:href') {
            return str_starts_with($value, '#');
        }

        // `fill="url(#gradient)"` is fine; `url(https://…)` and `javascript:`
        // are not, wherever they turn up.
        $lowered = strtolower($value);

        return ! str_contains($lowered, 'javascript:')
            && ! preg_match('/url\(\s*[\'"]?(?!#)/i', $lowered);
    }
}
