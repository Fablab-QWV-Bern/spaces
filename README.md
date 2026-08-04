# Quartierwerkstatt Reservation System

A booking system for the workstations of a neighbourhood workshop
(*Quartierwerkstatt*) — a shared makerspace with woodworking and metalworking
machines, 3D printers, a laser cutter and a few desks. It replaces an existing
system whose interface served as the reference.

Members reserve a machine for a slot; the calendar shows who is on which
workstation when, a floor plan shows who is in the workshop right now, and
recurring bookings (courses, maintenance days) are generated from a series
definition.

> **Note on language.** The user interface is German, because the workshop is.
> Everything else — code, comments, commit messages, documentation — is English.
> That means route paths (`/tag`, `/woche`, `/verwaltung`), query parameters
> (`?datum=`, `?arbeitsplatz=`) and UI labels stay German by design.

## What makes it interesting

Most of the difficulty is not in the CRUD but in the booking rules:

- **Workstations block each other.** The lathe blocks the bench next to it; the
  "Ruhetag" blocks any noisy machines with the tag `lärmig`. Blocking is resolved once, when
  a booking is created, and stored on the booking as a snapshot — so later
  configuration changes cannot retroactively invalidate a booking that was
  promised to be collision-free.
- **Overnight bookings.** Some areas allow a booking to span the night, e.g. for longer 3D print jobs. 
  The night hours do not count towards the maximum duration, so a booking from Friday 20:00
  to Saturday 09:00 is charged as two hours.
- **Series survive DST.** A weekly course at 09:00 stays at 09:00 local time
  across the clock change. Series therefore store local wall-clock time, which is
  the one deliberate exception to "everything is UTC".
- **Roles, not users.** Authentication is against a *role* whose password is
  shared by several people. Who actually booked is recorded as free-text name and
  contact on the booking itself.

## Stack

| Part      | Technology                                          |
| --------- | --------------------------------------------------- |
| Backend   | Laravel 13, PHP 8.3                                 |
| Frontend  | Angular 22 (signals, standalone components), an SPA |
| Database  | MariaDB 11.4                                        |
| API       | OpenAPI 3.0, contract-tested with Spectator         |
| Tests     | Pest (backend), Vitest (frontend)                   |
| Hosting   | Shared hosting with Plesk, deployed via GitHub Actions |

## Repository layout

```
spec/                       Functional spec and the OpenAPI contract
  Reservationsystem.markdown  What the system is supposed to do
  reservation-api.yml         The API contract — this governs, not the code
backend/                    Laravel application
  app/Domain/Booking/         All booking rules live here and nowhere else
  tests/                      Pest suite, every feature test contract-checked
frontend/                   Angular SPA
  src/app/calendar/           Day, week and single-workplace views
  src/app/booking/            The booking form
  src/app/admin/              Areas, workplaces, roles, series, configuration
  src/app/map/                Floor plan with live occupancy
  src/app/api/                Generated API client — do not edit by hand
docker-compose.yml          MariaDB for development
```

## Architecture in three rules

**1. The spec is the contract.** `spec/reservation-api.yml` governs, not the code.
Spectator validates every request and response in the feature tests against the
YAML, so a response shape that drifts from the spec turns the suite red. The
Angular client is generated from the same file with `npm run api:generate` — it is
never hand-written.

**2. Validation lives in the backend only.** All booking rules sit in
`backend/app/Domain/Booking/`. The frontend checks required fields and asks
`POST /bookings/validate` for everything else. The one exception is the booking
horizon (`frontend/src/app/calendar/booking-horizon.ts`), which the form needs in
order to know how long its date list should be — but it is computed there, never
*enforced* there.

**3. A series produces bookings; it is not one.** `booking_series` describes a
rhythm. The calendar contains ordinary bookings, one per occurrence, with a
`booking_series_id` as the only hint. Editing an occurrence detaches it from the
series, and editing the series reconciles the future occurrences in place rather
than deleting and recreating them — because the booking ID is the UID in the iCal
feed.

`CLAUDE.md` documents the decisions behind the code in detail — the ones you
cannot read off the source.

## Getting started

Requirements: PHP 8.3, Composer, Node (see `.nvmrc`), Docker.

```bash
git clone <this repo> && cd spaces
```

Start the database:

```bash
docker compose up -d
```

Set up the backend:

```bash
cd backend && composer install && cp .env.example .env && php artisan key:generate
```

Create the schema and seed development data:

```bash
cd backend && php artisan migrate:fresh --seed --force && php artisan db:seed --class=BookingSeeder --force
```

Link the photo storage once, so uploaded images are served:

```bash
cd backend && php artisan storage:link
```

Install the frontend dependencies:

```bash
cd frontend && npm ci
```

## Running it

Two processes, plus the database container:

```bash
cd backend && php artisan serve
```

```bash
cd frontend && npx ng serve
```

The API is then on `http://localhost:8000`, the SPA on `http://localhost:4200`.
The dev server proxies `/api` and `/storage` to the backend, so the SPA talks to
one origin.

Development credentials: `Mitglied` / `mitglied-kennwort` and `Admin` /
`admin-kennwort`. Without logging in you act as the anonymous role, which may view
the calendar but not book.

Series instances beyond today come from a scheduled command; run it by hand
locally:

```bash
cd backend && php artisan booking-series:instantiate
```

## Testing

```bash
cd backend && ./vendor/bin/pest
```

```bash
cd frontend && npx ng test --watch=false
```

The backend suite is where the interesting cases live: collision rules, chargeable
duration across the night, and series instantiation across a DST change.

## Regenerating the API client

After any change to `spec/reservation-api.yml`:

```bash
cd frontend && npm run api:generate
```

The generated `Error` model shadows the global `Error`; import it as `ApiError`.

## Icons

Icons are inline SVG paths in `currentColor`, generated from `lucide-static` — no
icon font, no emoji, no network request at runtime. Adding one is a line in the
`ICONS` table of `frontend/scripts/generate-icons.mjs` plus:

```bash
cd frontend && npm run icons:generate
```

## The floor plan

`frontend/public/karte.svg` is a shipped asset, not source code. It is fetched at
runtime and grafted into the DOM by hand — not via `innerHTML`, because Angular's
sanitiser strips the `id` attributes that carry the mapping to workplaces.
Rearranging the workshop means swapping the file; nothing needs rebuilding.

## Deployment

GitHub Actions builds the SPA on every push to `main` and writes the Laravel
application, with the built frontend in `public/`, onto the `deploy` branch. The
hosting pulls that branch and runs `backend/deploy.sh`, which handles
`composer install`, migrations, caches and the storage symlink. `CLAUDE.md`
documents the constraints that shaped this (no SSH, no Node on the server, no
long-running processes).

## Licence

MIT.
