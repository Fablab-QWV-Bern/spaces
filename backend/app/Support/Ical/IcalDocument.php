<?php

namespace App\Support\Ical;

/**
 * Ein iCalendar-Dokument nach RFC 5545 — Zeilen sammeln, maskieren, falten.
 *
 * Hier steckt alles, was am Format nicht auf den ersten Blick sichtbar ist:
 * CRLF als Zeilenende, die Maskierung von `\`, `;`, `,` und Zeilenumbruch in
 * Textwerten, und die Faltung langer Zeilen. Die Kalenderclients sind darin
 * unterschiedlich streng; ein Feed, der es hier ungenau nimmt, funktioniert bei
 * dreien und bricht beim vierten.
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
     * Eine Eigenschaft mit maskiertem Textwert.
     *
     * @param  array<string, string>  $parameters
     */
    public function text(string $name, string $value, array $parameters = []): self
    {
        return $this->raw($name, self::escape($value), $parameters);
    }

    /**
     * Eine Eigenschaft, deren Wert nicht maskiert werden darf — Zeitpunkte,
     * Bezeichner, Aufzählungswerte.
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
     * Die Reihenfolge ist wesentlich: der Backslash muss zuerst verdoppelt
     * werden, sonst maskiert der zweite Durchgang die eigenen Fluchtzeichen.
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
     * Zeilen über 75 Oktett werden umgebrochen, die Fortsetzung beginnt mit
     * einem Leerzeichen. Gezählt wird in Oktett, geschnitten aber an
     * Zeichengrenzen — ein mitten durchtrenntes „ä" wäre kein gültiges UTF-8
     * mehr, und Namen mit Umlauten sind hier die Regel.
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
                // Das Leerzeichen der Fortsetzungszeile zählt mit.
                $limit = 74;
            }

            $current .= $character;
        }

        return $folded.$current;
    }
}
