<?php

namespace App\Support;

/**
 * An area's colour in a spelling an old Safari can paint.
 *
 * Areas carry any CSS colour, and the sliders in the area form write `oklch(…)`
 * — which Safari learnt in 15.4. `/tafel` is for the iPads that stopped well
 * before that, so it hands them `rgb(…)` instead. Everything else passes through
 * as it came: `rgb()`, `hsl()`, hex and names are older than any browser this
 * page will meet.
 *
 * Out-of-gamut values are clipped per channel rather than mapped the way CSS
 * Color 4 asks. At the chroma the form recommends that never comes into play;
 * where it does, the colour shifts a little, which on a kiosk display is the
 * smaller loss than painting nothing at all.
 */
class LegacyColor
{
    private const NUMBER = '[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?';

    public static function toRgb(string $color): string
    {
        $value = trim($color);
        $number = self::NUMBER;
        $pattern = "/^(oklch|oklab)\\(\\s*({$number}%?|none)\\s+({$number}%?|none)\\s+({$number}(?:deg)?%?|none)\\s*(?:\\/\\s*({$number}%?|none)\\s*)?\\)$/i";

        if (! preg_match($pattern, $value, $match)) {
            return $value;
        }

        $lightness = self::component($match[2], 1.0);

        if (strtolower($match[1]) === 'oklch') {
            $chroma = self::component($match[3], 0.4);
            $hue = deg2rad((float) $match[4]);
            [$a, $b] = [$chroma * cos($hue), $chroma * sin($hue)];
        } else {
            [$a, $b] = [self::component($match[3], 0.4), self::component($match[4], 0.4)];
        }

        [$red, $green, $blue] = self::oklabToSrgb($lightness, $a, $b);
        $alpha = isset($match[5]) && $match[5] !== '' ? self::component($match[5], 1.0) : 1.0;

        return $alpha < 1.0
            ? sprintf('rgba(%d, %d, %d, %s)', $red, $green, $blue, round(max(0, $alpha), 3))
            : sprintf('rgb(%d, %d, %d)', $red, $green, $blue);
    }

    /** A number, a percentage of what 100% stands for, or `none` for zero. */
    private static function component(string $value, float $hundredPercent): float
    {
        if (strtolower($value) === 'none') {
            return 0.0;
        }

        return str_ends_with($value, '%')
            ? (float) rtrim($value, '%') / 100 * $hundredPercent
            : (float) $value;
    }

    /**
     * Björn Ottosson's Oklab to linear sRGB, then the sRGB transfer curve.
     *
     * @return array{int, int, int}
     */
    private static function oklabToSrgb(float $lightness, float $a, float $b): array
    {
        $l = ($lightness + 0.3963377774 * $a + 0.2158037573 * $b) ** 3;
        $m = ($lightness - 0.1055613458 * $a - 0.0638541728 * $b) ** 3;
        $s = ($lightness - 0.0894841775 * $a - 1.2914855480 * $b) ** 3;

        $linear = [
            4.0767416621 * $l - 3.3077115913 * $m + 0.2309699292 * $s,
            -1.2684380046 * $l + 2.6097574011 * $m - 0.3413193965 * $s,
            -0.0041960863 * $l - 0.7034186147 * $m + 1.7076147010 * $s,
        ];

        return array_map(function (float $channel): int {
            $channel = min(1.0, max(0.0, $channel));
            $encoded = $channel <= 0.0031308
                ? 12.92 * $channel
                : 1.055 * $channel ** (1 / 2.4) - 0.055;

            return (int) round($encoded * 255);
        }, $linear);
    }
}
