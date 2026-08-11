# Quartierwerkstatt Reservation System

Booking system for the workstations of a neighbourhood workshop (_Quartierwerkstatt_).
It replaces an existing system whose interface serves as the reference (screenshots
in `spec/`).

## Layout

- `spec/` — functional spec (`Reservationsystem.markdown`) and API contract (`reservation-api.yml`)
- `backend/` — Laravel 13, PHP 8.3
- `frontend/` — Angular 22, an SPA against the REST API
- `docker-compose.yml` — MariaDB for development

## Language

Comments, commit messages and identifiers are in **English**. The **user interface
is German** — it serves a German-speaking workshop, so labels, route paths
(`/tag`, `/woche`, `/verwaltung`), query parameters (`?datum=`, `?arbeitsplatz=`)
and page titles stay German on purpose. Comments explain the _why_, not the _what_.

## The spec is the contract

`spec/reservation-api.yml` governs, not the code. Changing a response shape means
changing the spec first.

- Spectator checks request and response against the YAML in every feature test.
  Deviations turn the suite red.
- The Angular client is generated (`npm run api:generate`), not written. Models
  like `BookingWrite` or `Error` come from there — no hand-written shapes such as
  `{ message?: string }`.
- The generated `Error` model shadows the global `Error`; import it as `ApiError`.

## Architectural decisions you cannot read off the code

- **Validation lives in the backend only.** All booking rules sit in
  `backend/app/Domain/Booking/`. The frontend checks required fields and nothing
  else; for everything further it asks `POST /bookings/validate`. Never
  reimplement rules in the frontend.
- **The booking horizon is the one rule the frontend also knows** —
  `frontend/src/app/calendar/booking-horizon.ts`. This is not a reimplementation
  but an anticipation: the date list in the form has to know how long it will be,
  and the calendar where to stop accepting clicks. Both are questions asked
  _before_ the check that `POST /bookings/validate` only answers for an actual
  booking. Anyone who does reach the edge still gets the violation from there — so
  the limit is nowhere _enforced_ twice, only computed twice. What is produced
  here is information rather than a verdict: not "not possible", but how many days
  ahead this area can be booked and from when this day becomes bookable.
- **No field may sit empty while its value would be saved.** A `<select>` whose
  value matches no option displays nothing in Chrome — and the booking form
  receives such values regularly: a date from the URL beyond the horizon, a
  duration from a booking made before the maximum last changed. That is why the
  date, duration and end-time lists always also carry the currently set value.
  Otherwise you read an error about something that is nowhere on screen.
- **Overnight always means the following night.** A selectable end date existed
  once; with it you could set the same day and thus an end before the start. Now
  there is only a time of day there, and one drawn from the set where the
  chargeable duration lands on a permitted value — it is computed not as "start
  plus duration" but as what remains after the evening until closing time. Booking
  longer than one night takes the duration in whole-day steps; when editing,
  therefore, only what actually ends on the following day counts as "overnight".
- **There are no users, only user roles.** Authentication happens as a role whose
  password is shared by several people. `Role` is the Authenticatable.
- **Blocking is a snapshot.** When a booking is created, `blocksWorkplaceIds` and
  the workplaces matched by tag are resolved and recorded on the booking. Later
  configuration changes do not touch existing bookings.
- **Two bookings that block the same third workplace do not collide.** An
  implementation as a set intersection would be wrong.
- **Times are UTC** — with one exception: `booking_series` stores local wall-clock
  time so that a series takes place at the same time of day across a DST change.
  Those columns are deliberately left uncast.
- **Colours are derived, not written down.** `frontend/src/_colors.scss` holds
  seven source colours; everything else follows from them via `color-mix` and
  lives as a CSS variable on `:root`. No hex value appears anywhere else in the
  code — writing one means you either overlooked a name or need a new one in the
  palette. Two rules are baked into the mixes: mixing happens in `oklab`, and
  lighter goes via `--paper`, darker via black. Darkening via `--ink` would pull
  warm tones towards grey. The greys do not come from `--ink` itself but from
  `--shade` — `--ink` with a hint of accent, because a pure gradient towards white
  loses its blue cast in the middle.
- **Icons are inline SVG in `currentColor`**, not an icon font and not emoji. A
  coloured emoji would bring along a colour no palette knows about and would look
  different on every system; a font would cost either a request to Google or
  several megabytes of payload, and would show the ligature name in plain text
  until it arrived. The paths are still not written by hand:
  `frontend/scripts/generate-icons.mjs` fetches them from `lucide-static` and
  writes `icon-paths.ts` — hand-copied path data works for a long time and then
  fails silently, because Lucide occasionally redraws icons. A new icon is one
  line in the script's `ICONS` table plus `npm run icons:generate`.
  `lucide-angular` would be the obvious route but stops at Angular 21; as a dev
  dependency the question does not arise, and only the generated table reaches the
  bundle.
- **Two kinds of placement in the calendar.** Blocks sit on named grid lines
  (`grid-column: t0900 / t1300`); the form preview and the now-line sit on
  percentages. Both build on `visibleRange()` in
  `frontend/src/app/calendar/time-axis.ts` — the clipping logic exists only once.
- **One cell for all zoom levels.** `DayTrack` is a timeline across the opening
  hours of _one_ day. The day view has one per row, the week view seven. Because
  every cell brings its own grid, `t0900` means the same thing everywhere; the
  lines need no day component. What differs between the levels is only density —
  and that is set through CSS variables (`--columns`, `--bar-padding`,
  `--quarter-line`), not through branching in the code.
- **Every zoom level is its own route** (`/tag`, `/woche`), so that a view is
  linkable and the back button leads to the previous level. The date travels along
  as `?datum=`; `date-in-url.ts` keeps it in sync in both directions.
- **You cannot book in the week view.** A quarter hour would not be two pixels
  wide there. A click on empty space opens the day instead.
- **The single-workplace view (`/arbeitsplatz`) is not a third zoom level** but
  the day view with its axes swapped: one workplace across all days of the month
  instead of one day across all workplaces. Same cell, same scale — which is why
  booking works there just as it does in the day view. The workplace travels along
  as `?arbeitsplatz=` and is read _only_ from the URL. The way in is the name in
  the workplace row — someone who means a workplace has it right in front of them
  there; a dropdown in the header would enumerate the same names a second time.
  The way back is a button that only this view shows in the header. So that
  paging does not clear the workplace, `date-in-url.ts` writes with
  `queryParamsHandling: 'merge'`.
- **The detail card is opened by the platform, not by us.** The bar is a
  `<button popovertarget>`, the card the named popover — toggling, Escape, click
  outside and keyboard handling all come from the browser. Two things follow that
  would otherwise look like detours: the card sits _next to_ the bar rather than
  inside it (a `<button>` may not contain a button, and the card has one), and
  `CalendarBlock` carries `display: contents` so that the bar remains the cell's
  grid item. Positioning uses CSS Anchor Positioning; the implicit anchor from
  `popovertarget` does not take effect in Chrome, hence the explicit
  `anchor-name: --block`. No reimplementation with custom pointer handlers — that
  was there once and is deliberately gone.
- **The anonymous role must not be given `manageRoles`.** The spec does not
  require this, but with that permission anyone could make themselves an
  administrator without logging in. The invariant "at least one role has
  `manageRoles`" therefore only counts roles you can actually log in as.
- **The admin area has no route guard, but it does have a frame.** A guard
  prevents a navigation and would have to redirect somewhere — and then the
  reason would be gone, which is the only thing worth showing to someone standing
  in front of a locked page. What the router carries instead is the declaration:
  every admin route names in its `data` the permission it needs, its heading and
  how its notice reads. `admin-shell.ts` is the frame around all of them, reads
  that, loads the session once for the whole area and only then activates the
  page. So the check is written once instead of in nine templates, and no page
  fetches data it may not see — the outlet does not exist until the permission
  does. Enforcing remains the backend's business either way.
- **The order is dragged, not typed.** Areas and workplaces have a `sortOrder`,
  but no field for it — it is set in the list by dragging and then saved for all
  of them at once (`PUT /areas/order`, `PUT /workplaces/order`, a list of ids
  whose positions become the numbers). Hence no `sortOrder` in `AreaWrite` and
  `WorkplaceCreate` either: with a second way to the same value, editing a
  workplace would overwrite an order nobody touched. Three things follow from
  it. The call replaces the whole list rather than the rows that moved — half a
  saved order is one nobody arranged, and the backend rejects an incomplete
  list. For workplaces the position counts within the area, and every group in
  the list is its own drag area (`drag-order.ts`), so dragging can never change
  the area — that stays a matter for the form. And whatever arrives new lands at
  the end, because that is where you look for it.
- **Photo URLs are relative** (`/storage/…`). API, storage and SPA live on the
  same host; an absolute URL would come from `APP_URL`, and a misconfigured
  `APP_URL` on the hosting would make every photo unreachable at once.
- **Images are processed by GD**, not by a library from Composer: the hosting
  ships GD, and `vendor/` travels by FTP. Thumbnail and downscaled original are
  both produced from the original file — scaling twice costs sharpness.
- **A series produces bookings; it is not one.** `booking_series` describes a
  rhythm; nothing of it appears in the calendar — instead there is an ordinary
  booking per occurrence, with `booking_series_id` as the only hint. Everything
  else follows from that: instances carry no creator (later top-ups come from a
  cron run without a session), they count as confirmed as far as the usage rules
  are concerned (`BookingSeriesWrite` has no field for it — whoever may create a
  series confirms it with it), and they can be edited individually like any other
  booking.
- **Touching an instance detaches it.** Two markers record this, and they
  deliberately do two different things: `bookings.series_detached` says "do not
  touch this row", `booking_series_exceptions` says "produce nothing at this beat".
  Both are needed — without the flag, reconciliation would clear the moved
  instance away as an orphaned occurrence; without the table, a duplicate would
  appear at its old time. The exception is written by whoever deletes an instance,
  and by whoever changes one for the first time; at that moment its `start_time`
  is still the beat time, afterwards it is not.
- **No soft delete for cancelled instances.** A row left standing would have to be
  filtered out in every query against `bookings` — including in `CollisionChecker`,
  which is the only place that bypasses the model and goes through the query
  builder, because only that sets the gap locks. A condition forgotten there would
  block other people's workplaces with a booking nobody can see. The exception
  table has exactly one reader instead.
- **That an occurrence has been detached is shown in the booking form**, not on
  the detail card in the calendar. The card is seen by everyone who opens the
  calendar, and to them it is information about internals; whoever has the form
  open is about to change something and needs it. It is unguarded there
  nonetheless — hiding from that person of all people what their save will do
  would be the wrong kind of thrift.
- **Editing reconciles rather than deleting and recreating.** An occurrence that
  still exists keeps its row and therefore its ID — and the ID is the UID in the
  iCal feed. Deleting would make all future occurrences vanish from every
  subscription and come back as new ones.
- **The series is checked once, not every instance.** What makes up a series —
  workplace, wall-clock time, duration — is the same for all instances; it is
  therefore checked against the first one. Three violations are exempt: a
  collision makes the individual instance drop out rather than the series fail (it
  is reported as `skippedInstances`), the maximum booking horizon does not apply
  to series (otherwise none would reach a year), and a start in the past is normal
  for a rhythm — generation begins from now anyway.
- **No daily interval.** For the workshop, daily is not a series but a permanent
  occupation. Fortnightly is `WEEKLY` with `intervalCount: 2` — that is what the
  field is for; a separate enum value would be a second spelling of the same
  thing. The pair does not even surface in the series form: `series-rhythm.ts`
  translates between it and the three options on offer. There is no weekday
  field — it follows from the date.
- **The series form does not pre-validate, and shows no occurrences.** Both would
  be rule knowledge in the frontend: the pre-flight check would have to know that
  a collision is not an error for a series, and the occurrence list would have to
  reimplement the skip rule from `SeriesSchedule`. Validation happens on save; the
  preview is the single-workplace view the path leads to afterwards. Nothing is
  handed along in the process — `skippedInstances` appears only in that one
  response and is stored nowhere.
- **The iCal feed always renders as the anonymous role**, even with a session
  cookie. A calendar client has none; if the feed took the logged-in role into
  account, the preview in the browser would show more than the subscription
  afterwards delivers. This way it is the same document for everyone, and a shared
  link cannot leak contact details. It therefore checks `viewBookings` itself
  rather than via the middleware.
- **One VEVENT per booking, no RRULE** — even though series exist. A series
  instance is its own booking with its own ID; RRULE would additionally require
  local time with an accompanying VTIMEZONE. As long as every instance sits
  individually in the database, UTC timestamps are the more honest representation.
- **The floor plan is a shipped file, not source code.**
  `frontend/public/karte.svg` is fetched at runtime and grafted into the tree by
  hand — not via `innerHTML`, because Angular's sanitisation strips `id`
  attributes, and those are exactly what carries the mapping to the workplaces.
  Rearranging the workshop means swapping the file and rebuilding nothing;
  incidentally its 300 kB stay out of the bundle of every other view.
- **The state sits on the workplace's own shape** as a class — `.busy`,
  `.soon-busy`, and nothing at all for free. So the map needs no geometry for it:
  no `viewBox` arithmetic, no placement in percentages. It takes the full width
  and gets its height from its own aspect ratio, so for the portrait floor plan it
  scrolls — better large and scrolled than fully visible and illegible.
- **The figure is not drawn but borrowed.** The plan brings one along under
  `#figur`, at the map's scale and in its colour; a hand-written path would be a
  second source of truth and would not travel along the next time the file is
  swapped. It is measured, moved into the `defs` — where it is no longer drawn but
  stays reachable for `<use>` — and then hung in once per occupied workplace.
  Measure first, then stow: what is not drawn has no bounding box either. The
  `<use>` goes in as a *sibling of the shape*, not into a layer of its own: there
  it is placed in exactly the user space the shape was measured in, whatever
  transforms the plan puts around its groups, and one translation settles it for
  good — nothing to recompute when the window changes size. A plan without a
  figure is not an error; the outline then carries the state alone.
- **A figure means presence, not occupancy.** It appears only where somebody is
  actually standing — not for what is merely imminent, and not for a blockage,
  where the bench is unusable because somebody is at *another* one. Both of those
  keep their outline. Marking them with a figure would put a person where none is.
- **The state shows in the outline, not in the fill.** The shapes carry their
  area's colour as an inline `fill`, and inline beats any stylesheet. Overriding
  it would cost an `!important` and, worse, the information about which area a
  bench belongs to. `soon-busy` is additionally dashed, so the two do not depend
  on colour alone. What counts as soon is half an hour — `SOON_MINUTES` in
  `occupancy.ts`. The pointer does reach the fill, but through
  `filter: brightness()` rather than a colour: a filter works on whatever it
  finds, needs no `!important`, and brings no shade the palette would have to
  know about.
- **The plan takes no clicks, only the workplaces do.** `.drawing` is
  `pointer-events: none` and `.workplace` switches it back on. Without that a
  click on a workplace's own label would go nowhere: the names are drawn in a
  layer of their own, above the shapes and outside them, so the event would never
  pass a workplace on its way up. Both rules hang off the class `MapView` sets
  itself, so the file is asked for nothing beyond the identifiers.
- **The card is a popover, but nothing declares it.** `popovertarget` exists on
  HTML buttons, and the trigger here is an SVG shape — so the card is opened with
  `showPopover()` from a single delegated listener, while toggling, Escape and
  light dismiss still come from the platform. Anchor positioning does not reach
  into SVG either: `anchor-name` on a shape is parsed and ignored, because a shape
  generates no CSS box. Hence one invisible div over the plan that takes the
  clicked shape's measurements and carries the anchor. Shapes get `role="button"`
  and `tabindex` so that the keyboard reaches them; the browser's own focus ring
  is suppressed because it is amber and would read as a third state.
- **A free workplace answers too.** The card then shows the name, "frei" and the
  way into the booking form — projected into `BookingCard`, which itself knows
  only bookings. A card of its own would have written the booking half a second
  time, including its routes into the form.
- **On a wide screen the map gets a column beside it** (`agenda.ts`): the day's
  remaining bookings, grouped into "Aktuell" and the part of the day in which
  something begins — Vormittag, Nachmittag, Abend, cut at noon and at five within
  the 08:00–21:00 opening hours. It answers what the plan cannot — not "is this
  bench taken" but "what is still coming today"; the map has no date and no time
  axis. Three groups and not one per hour, because a thinly booked day would
  otherwise produce a heading per booking — and because that is how the day is
  talked about in the workshop. One row per booking rather than per occupied
  workplace: a booking that blocks three neighbours is one event, and three lines
  would read as three. Below the threshold the column disappears entirely instead
  of shrinking — everything in it is on the map as well, and the plan needs the
  width more.
- **The plan's width is capped at 40rem, and the room left over goes to its
  left.** Its aspect ratio is fixed, so every extra pixel of width is paid for in
  height and thus in vertical scrolling — and the labels are legible long before
  the plan fills a wide window. Left rather than centred, so that it stays next
  to the agenda column instead of drifting away from it.
- **The map is not a third zoom level.** It has no date but the present moment,
  and asks for it afresh every minute — which is why its button sits next to the
  view switcher rather than in it, and its header carries neither paging nor a
  date picker.

## Environment

Activate the right Node version before every frontend command:

```bash
. ~/.nvm/nvm.sh && nvm use
```

Composer is pinned to `platform.php = 8.3` in `backend/composer.json`. The hosting
can do 8.5 by now, so the pin no longer protects against too new a resolution — but
it keeps `composer.lock` independent of whichever PHP version happens to be
installed locally. Never remove it outright; whoever raises it, raises it to the
version configured for the domain.

## Commands

```bash
docker compose up -d                          # MariaDB
cd backend && php artisan serve               # API on :8000
cd frontend && npx ng serve                   # SPA on :4200, proxies /api and /storage
```

Once, so that uploaded photos are served:

```bash
cd backend && php artisan storage:link
```

```bash
cd backend && ./vendor/bin/pest               # backend tests
cd frontend && npx ng test --watch=false      # frontend tests
cd frontend && npm run api:generate           # client from the spec
```

Reset the test data (this also drops the sessions — log in again afterwards):

```bash
cd backend && php artisan migrate:fresh --seed --force && php artisan db:seed --class=BookingSeeder --force
```

The `BookingSeeder` checks its rows against the collision rules and skips
conflicting ones. One skipped row per run is expected. The three rows it creates
as a series only get today's instance — the rest would come from the daily run,
which is triggered by hand locally:

```bash
cd backend && php artisan booking-series:instantiate
```

Development credentials: `Mitglied` / `mitglied-kennwort`, `Admin` /
`admin-kennwort`.

## Hosting

hosttech "Smart Deal" with Plesk: PHP 8.5, MariaDB, 180 seconds execution time
(configurable up to 600), no long-running processes. Everything periodic runs via
cron, not via queue workers.

**A single cron entry suffices**, in Plesk under "Scheduled Tasks", every minute:

```
/opt/plesk/php/8.5/bin/php /var/www/vhosts/…/artisan schedule:run
```

What runs when is in `backend/routes/console.php` — in the repository rather than
in the Plesk form, for the same reason as with deployment. So far the only thing
hanging off it is `booking-series:instantiate`, which re-instantiates the series a
year ahead daily at 03:00. Without the entry, the series eventually run out
without anything else breaking.

**No SSH, but a shell at deployment time.** Plesk pulls from GitHub via Git and
then runs the shell commands configured for it. That is the only access to the
command line — there is no session in which you could look around, and whatever
the deployment actions print ends up only in the Plesk log.

**Plesk pulls the `deploy` branch, not `main`.** No Node runs on the server, so
the interface has to arrive built. `.github/workflows/deploy.yml` builds it on
every push to `main` and writes `backend/` together with the SPA in `public/` onto
`deploy` — the Laravel directory sits at the root there, and the document root
points at its `public/`. The branch is appended to and never rewritten, because
Plesk's clone cannot stomach a force push.

`vendor/` does not travel along: `composer install` runs on the server. As a
deployment action, Plesk holds only one line:

```
bash deploy.sh
```

Everything else is done by `backend/deploy.sh` — in the repository rather than in
the Plesk form, because steps in a text field can neither be diffed nor rolled
back. Three things in it are not visible from the outside:

- **`composer install` comes before `artisan down`, not after.** On the first run
  there is no `vendor/` yet, so `artisan` would not even start. The maintenance
  page is therefore only put up if an installation already exists.
- **The full PHP path**, because a bare `php` in Plesk's actions means the system
  PHP and not the domain's.
- **After a failure the maintenance page stays up.** From the migration onwards
  the code is new and the schema possibly still old; serving a broken application
  would be worse information than an absent one.
- **Composer is optional.** It is not reliably reachable in the deployment
  action — Plesk's own lives in different places depending on the installation, and
  an action's `PATH` is shorter than a login shell's. If it is missing, deployment
  still goes through as long as `vendor/` matches the current `composer.lock`; the
  checksum for that lives in `storage/framework/composer-lock.sha256`. Only once
  the dependencies have changed does the script stop and demand the Composer
  button in Plesk. A known path can be handed to the action with
  `COMPOSER_BIN=… bash deploy.sh`.

`.env` and the contents of `storage/` are not in the repository and are created by
hand once; deployment does not touch them. Photos live under `storage/app/public`
and are served through the `public/storage` symlink, which `storage:link` renews
on every deployment.

## Working practices

- Run the formatters (`pint`, `prettier`) once at the end, not after every
  change — every run otherwise triggers large file notifications.
- Verify in the browser only where it finds something: yes for logic and geometry,
  but for pure CSS tweaks ask rather than taking screenshots.
- In components with an inline template (`template:`, `styles:`), no backticks in
  comments — they terminate the template literal. The error is then reported on
  `@Component({` rather than where it actually is, and `ng serve` silently keeps
  serving the last intact bundle. Experience says you look for the cause in the
  browser first rather than in the server's output.
- For a new, self-contained task a fresh session is worth more than continuing
  this one — otherwise the whole history is sent along on every turn.

## Open

- Deployment test on hosttech (the largest untested risk): does `composer` run in
  Plesk's deployment actions, and is `symlink()` allowed for `storage:link`?
- Xdebug is loaded on the server (`50-xdebug.ini`). If `xdebug.mode` is not `off`,
  that costs noticeable performance.
- The four `_3d-drucker-*` in `frontend/public/karte.svg`: the plan shows four side
  by side, the configuration knows only three besides the XL. Until that is
  decided they stay empty — not an error, but no information either. The rest of
  the renaming table in `spec/karte-kennungen.markdown` is done.
- Defective and disabled workplaces are not marked on the map. Free, occupied and
  about to be occupied are; those two would need a third and fourth look, and it
  is not settled whether the map is where one wants to read them.
- Cron entry for `schedule:run` on the hosting (see "Hosting") — without it the
  series horizon stays wherever the last change left it.
- Subscription link in the admin area with filters (area, workplace) — the feed
  supports it, the interface so far only offers the unfiltered calendar
