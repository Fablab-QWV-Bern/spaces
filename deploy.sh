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

# Das blosse `php` ist in Plesks Aktionen das System-PHP, nicht das der Domain.
PHP="${PHP:-/opt/plesk/php/8.5/bin/php}"
[ -x "$PHP" ] || PHP="$(command -v php)"

if command -v composer >/dev/null 2>&1; then
    COMPOSER=(composer)
elif [ -f /usr/lib/plesk-9.0/composer.phar ]; then
    COMPOSER=("$PHP" /usr/lib/plesk-9.0/composer.phar)
else
    echo 'Kein composer gefunden. Abhängigkeiten über den Composer-Knopf in Plesk installieren.' >&2
    exit 1
fi

# Beim ersten Lauf gibt es noch kein vendor/, artisan wäre also nicht startbar.
# Danach schon — dann soll die Wartungsseite stehen, bevor die Abhängigkeiten
# unter der laufenden Anwendung ausgetauscht werden.
if [ -f vendor/autoload.php ]; then
    "$PHP" artisan down --render=errors::503 --retry=60
fi

"${COMPOSER[@]}" install --no-dev --optimize-autoloader --no-interaction --no-progress

# Wenn ab hier etwas schiefgeht, bleibt die Wartungsseite absichtlich stehen:
# der Code ist dann schon neu, das Schema womöglich noch alt. Eine kaputte
# Anwendung auszuliefern wäre die schlechtere Auskunft als eine abwesende.
fehlschlag() {
    echo >&2
    echo 'Bereitstellung abgebrochen — die Anwendung bleibt in Wartung.' >&2
    echo "Nach dem Beheben von Hand: bash deploy.sh (oder $PHP artisan up)" >&2
}
trap fehlschlag ERR

"$PHP" artisan migrate --force
"$PHP" artisan optimize
"$PHP" artisan storage:link --force

trap - ERR
"$PHP" artisan up
