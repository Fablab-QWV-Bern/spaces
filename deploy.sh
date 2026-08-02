#!/usr/bin/env bash
#
# Bereitstellungsaktion für Plesk. Dort steht als einziger Befehl:
#
#     bash deploy.sh
#
# Plesk hat den Branch `deploy` zu diesem Zeitpunkt bereits ausgecheckt; dieses
# Skript macht daraus eine lauffähige Anwendung. Es liegt hier statt im
# Plesk-Textfeld, damit die Schritte im Repository stehen und nicht in einem
# Formular, das niemand vergleichen kann.

set -euo pipefail
cd "$(dirname "$0")"

# Ohne SSH ist das Bereitstellungslog der einzige Ort, an dem sich nachsehen
# lässt, wo und womit gearbeitet wurde.
echo "Verzeichnis: $PWD"

# Plesks Composer-Oberfläche sucht sich ihre Anwendung selbst und greift dabei
# auch schon mal eine fremde composer.json aus dem Dokumentenstamm. Dieses
# Skript arbeitet nur dort, wo es selbst liegt — und hält an, wenn das nicht
# nach dieser Anwendung aussieht.
if [ ! -f artisan ] || [ ! -f composer.lock ]; then
    echo 'Hier steht keine Laravel-Anwendung mit composer.lock. Nichts getan.' >&2
    exit 1
fi

# Das blosse `php` ist in Plesks Aktionen das System-PHP, nicht das der Domain.
PHP="${PHP:-/opt/plesk/php/8.5/bin/php}"
[ -x "$PHP" ] || PHP="$(command -v php || true)"
if [ -z "$PHP" ]; then
    echo 'Kein PHP gefunden. Pfad über PHP=… vorgeben.' >&2
    exit 1
fi
echo "PHP:         $PHP ($("$PHP" -r 'echo PHP_VERSION;'))"

# Der PATH einer Bereitstellungsaktion ist kürzer als der einer Anmeldeschale,
# darum die üblichen Orte von Hand dazu.
PATH="$PATH:/usr/local/bin:/usr/bin:/opt/plesk/composer"

composer_gefunden=0
COMPOSER=()
for kandidat in \
    "${COMPOSER_BIN:-}" \
    "$(command -v composer 2>/dev/null || true)" \
    /usr/local/psa/var/modules/composer/composer.phar \
    /usr/lib/plesk-9.0/composer.phar \
    /opt/plesk/composer/composer.phar \
    ./composer.phar; do
    [ -n "$kandidat" ] && [ -f "$kandidat" ] || continue
    case "$kandidat" in
        *.phar) COMPOSER=("$PHP" "$kandidat") ;;
        *) COMPOSER=("$kandidat") ;;
    esac
    composer_gefunden=1
    echo "Composer:    $kandidat"
    break
done
[ "$composer_gefunden" = 1 ] || echo 'Composer:    nicht gefunden'

# Beim ersten Lauf gibt es noch kein vendor/, artisan wäre also nicht startbar.
# Danach schon — dann soll die Wartungsseite stehen, bevor die Abhängigkeiten
# unter der laufenden Anwendung ausgetauscht werden.
if [ -f vendor/autoload.php ]; then
    "$PHP" artisan down --render=errors::503 --retry=60
fi

# Ab hier ist die Anwendung womöglich unten und der Code schon neu, das Schema
# aber noch alt. Wenn etwas schiefgeht, bleibt die Wartungsseite absichtlich
# stehen: eine kaputte Anwendung auszuliefern wäre die schlechtere Auskunft als
# eine abwesende.
fehlschlag() {
    local status=$?
    echo >&2
    echo "Gescheitert in Zeile ${BASH_LINENO[0]} mit Status ${status}: ${BASH_COMMAND}" >&2
    echo 'Bereitstellung abgebrochen — die Anwendung bleibt in Wartung.' >&2
    echo "Nach dem Beheben: bash deploy.sh (oder $PHP artisan up)" >&2
}
trap fehlschlag ERR

# Wenn die Aktion keinen Composer erreicht, ist das kein Grund zum Abbruch —
# solange das vorhandene vendor/ zu diesem composer.lock gehört. Nur wenn sich
# die Abhängigkeiten geändert haben, muss jemand den Composer-Knopf in Plesk
# drücken, sonst liefe die Anwendung gegen die falschen Pakete.
stempel=storage/framework/composer-lock.sha256
gefordert="$("$PHP" -r 'echo hash_file("sha256", "composer.lock");')"

if [ "$composer_gefunden" = 1 ]; then
    "${COMPOSER[@]}" install --no-dev --optimize-autoloader --no-interaction --no-progress
    printf '%s' "$gefordert" >"$stempel"
elif [ ! -f vendor/autoload.php ]; then
    echo 'Weder Composer noch vendor/. Einmalig über den Composer-Knopf in Plesk installieren.' >&2
    exit 1
elif [ ! -f "$stempel" ]; then
    # vendor/ kam von Hand; wir nehmen es als zum aktuellen Stand passend an.
    printf '%s' "$gefordert" >"$stempel"
    echo 'Ohne Composer weiter, vorhandenes vendor/ als passend angenommen.'
elif [ "$(cat "$stempel")" != "$gefordert" ]; then
    echo 'composer.lock hat sich geändert, aber kein Composer erreichbar.' >&2
    echo 'Abhängigkeiten über den Composer-Knopf in Plesk nachziehen.' >&2
    exit 1
else
    echo 'composer.lock unverändert, vendor/ bleibt wie es ist.'
fi

# Vor der Migration die Verbindung zeigen. Ohne Shell ist das Log die einzige
# Auskunft, und „migrate ist gescheitert" allein hilft niemandem weiter: hier
# steht, gegen welchen Host, welche Datenbank und welchen Benutzer es ging.
"$PHP" artisan db:show

"$PHP" artisan migrate --force
"$PHP" artisan optimize

# Nicht tödlich: ohne den Symlink fehlen die Fotos, alles andere läuft. Das
# Hosting muss dafür symlink() erlauben — ob es das tut, ist ungetestet.
if ! "$PHP" artisan storage:link --force; then
    echo 'Warnung: public/storage konnte nicht angelegt werden, Fotos bleiben aus.' >&2
fi

trap - ERR
"$PHP" artisan up
