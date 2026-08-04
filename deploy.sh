#!/usr/bin/env bash
#
# Deployment action for Plesk. The only command configured there is:
#
#     bash deploy.sh
#
# By this point Plesk has already checked out the `deploy` branch; this script
# turns that into a running application. It lives here rather than in the Plesk
# text field, so that the steps are in the repository and not in a form nobody can
# diff.

set -euo pipefail
cd "$(dirname "$0")"

# Without SSH the deployment log is the only place to look up where and with what
# the work was done.
echo "Directory:   $PWD"

# Plesk's Composer UI picks its application itself and sometimes grabs a foreign
# composer.json from the document root. This script only works where it itself
# lives — and stops if that does not look like this application.
if [ ! -f artisan ] || [ ! -f composer.lock ]; then
    echo 'No Laravel application with a composer.lock here. Nothing done.' >&2
    exit 1
fi

# A bare `php` in Plesk's actions means the system PHP, not the domain's.
PHP="${PHP:-/opt/plesk/php/8.5/bin/php}"
[ -x "$PHP" ] || PHP="$(command -v php || true)"
if [ -z "$PHP" ]; then
    echo 'No PHP found. Provide the path via PHP=…' >&2
    exit 1
fi
echo "PHP:         $PHP ($("$PHP" -r 'echo PHP_VERSION;'))"

# A deployment action's PATH is shorter than a login shell's, so the usual places
# are added by hand.
PATH="$PATH:/usr/local/bin:/usr/bin:/opt/plesk/composer"

composer_found=0
COMPOSER=()
for candidate in \
    "${COMPOSER_BIN:-}" \
    "$(command -v composer 2>/dev/null || true)" \
    /usr/local/psa/var/modules/composer/composer.phar \
    /usr/lib/plesk-9.0/composer.phar \
    /opt/plesk/composer/composer.phar \
    ./composer.phar; do
    [ -n "$candidate" ] && [ -f "$candidate" ] || continue
    case "$candidate" in
        *.phar) COMPOSER=("$PHP" "$candidate") ;;
        *) COMPOSER=("$candidate") ;;
    esac
    composer_found=1
    echo "Composer:    $candidate"
    break
done
[ "$composer_found" = 1 ] || echo 'Composer:    not found'

# On the first run there is no vendor/ yet, so artisan would not start. Later
# there is — and then the maintenance page should be up before the dependencies
# are swapped out underneath the running application.
if [ -f vendor/autoload.php ]; then
    "$PHP" artisan down --render=errors::503 --retry=60
fi

# From here on the application may be down and the code already new while the
# schema is still old. If something goes wrong, the maintenance page deliberately
# stays up: serving a broken application would be worse information than an absent
# one.
on_failure() {
    local status=$?
    echo >&2
    echo "Failed at line ${BASH_LINENO[0]} with status ${status}: ${BASH_COMMAND}" >&2
    echo 'Deployment aborted — the application stays in maintenance mode.' >&2
    echo "After fixing it: bash deploy.sh (or $PHP artisan up)" >&2
}
trap on_failure ERR

# If the action cannot reach a Composer, that is no reason to abort — as long as
# the existing vendor/ belongs to this composer.lock. Only when the dependencies
# have changed does somebody have to press the Composer button in Plesk, otherwise
# the application would run against the wrong packages.
stamp=storage/framework/composer-lock.sha256
required="$("$PHP" -r 'echo hash_file("sha256", "composer.lock");')"

if [ "$composer_found" = 1 ]; then
    "${COMPOSER[@]}" install --no-dev --optimize-autoloader --no-interaction --no-progress
    printf '%s' "$required" >"$stamp"
elif [ ! -f vendor/autoload.php ]; then
    echo 'Neither Composer nor vendor/. Install once via the Composer button in Plesk.' >&2
    exit 1
elif [ ! -f "$stamp" ]; then
    # vendor/ was put there by hand; we assume it matches the current state.
    printf '%s' "$required" >"$stamp"
    echo 'Continuing without Composer, assuming the existing vendor/ matches.'
elif [ "$(cat "$stamp")" != "$required" ]; then
    echo 'composer.lock has changed, but no Composer is reachable.' >&2
    echo 'Pull the dependencies via the Composer button in Plesk.' >&2
    exit 1
else
    echo 'composer.lock unchanged, vendor/ stays as it is.'
fi

# Show the connection before migrating. Without a shell the log is the only
# information available, and "migrate failed" on its own helps nobody: here it
# says which host, which database and which user it went against.
"$PHP" artisan db:show

"$PHP" artisan migrate --force
"$PHP" artisan optimize

# Not fatal: without the symlink the photos are missing, everything else runs.
# The hosting has to allow symlink() for this — whether it does is untested.
if ! "$PHP" artisan storage:link --force; then
    echo 'Warning: public/storage could not be created, photos will be missing.' >&2
fi

trap - ERR
"$PHP" artisan up
