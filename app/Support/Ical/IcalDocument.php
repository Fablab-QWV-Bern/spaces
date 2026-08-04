<?php

namespace App\Support\Ical;

/**
 * An iCalendar document per RFC 5545 — collect lines, escape, fold.
 *
 * Everything about the format that is not obvious at first glance lives here:
 * CRLF as the line ending, the escaping of `\`, `;`, `,` and line breaks in text
 * values, and the folding of long lines. Calendar clients differ in how strict
 * they are about it; a feed that is sloppy here works with three of them and
 * breaks with the fourth.
 */
final class IcalDocument
{
    /** @var list<string> */
    private array $lines = [];

    public function begin(string $component): self
    {
        $this->lines[] = "BEGIN:{$component}";

        return $this;
    }

    public function end(string $component): self
    {
        $this->lines[] = "END:{$component}";

        return $this;
    }

    /**
     * A property with an escaped text value.
     *
     * @param  array<string, string>  $parameters
     */
    public function text(string $name, string $value, array $parameters = []): self
    {
        return $this->raw($name, self::escape($value), $parameters);
    }

    /**
     * A property whose value must not be escaped — timestamps, identifiers,
     * enumerated values.
     *
     * @param  array<string, string>  $parameters
     */
    public function raw(string $name, string $value, array $parameters = []): self
    {
        foreach ($parameters as $parameter => $parameterValue) {
            $name .= ";{$parameter}={$parameterValue}";
        }

        $this->lines[] = "{$name}:{$value}";

        return $this;
    }

    public function render(): string
    {
        return implode('', array_map(
            fn (string $line): string => self::fold($line)."\r\n",
            $this->lines,
        ));
    }

    /**
     * The order matters: the backslash has to be doubled first, otherwise the
     * second pass escapes its own escape characters.
     */
    private static function escape(string $value): string
    {
        return str_replace(
            ['\\', "\r\n", "\n", "\r", ';', ','],
            ['\\\\', '\n', '\n', '\n', '\;', '\,'],
            $value,
        );
    }

    /**
     * Lines over 75 octets are wrapped, the continuation starting with a space.
     * Counting is in octets, but cutting happens at character boundaries — an "ä"
     * severed down the middle would no longer be valid UTF-8, and names with
     * umlauts are the rule here.
     */
    private static function fold(string $line): string
    {
        if (strlen($line) <= 75) {
            return $line;
        }

        $folded = '';
        $current = '';
        $limit = 75;

        foreach (mb_str_split($line) as $character) {
            if (strlen($current) + strlen($character) > $limit) {
                $folded .= $current."\r\n ";
                $current = '';
                // The continuation line's leading space counts too.
                $limit = 74;
            }

            $current .= $character;
        }

        return $folded.$current;
    }
}
