# Reservation System

## Stack

- Backend: PHP with Laravel
- Persistence: MariaDB
- SCSS
- Frontend: Angular with signals, as an SPA against the REST API. Inertia with React was considered
  and rejected: the website listing, the iCal subscription and the two tablets need the API anyway,
  and the kiosk views run permanently with periodic reloading — an SPA is the better fit for that.
  The Angular major version is pinned, not "latest".
- Validation exclusively in the backend. The frontend checks only required fields and grid snapping
  and asks the server for everything else (`POST /bookings/validate`), so that the booking rules
  exist only once.
- OpenAPI for the API spec
- Tests with Pest / PHPUnit, in particular for the collision rules, chargeable duration across the
  night, and the instantiation of series across a DST change
- Laravel scheduler (for the daily instantiation of booking series)

### Hosting

hosttech web hosting, "Smart Deal" package (CHF 6.90/month). The resulting constraints:

- **No SSH, but a shell at deployment time.** Plesk pulls from GitHub via Git and then runs the
  shell commands configured for it. That is why `composer install` and `php artisan migrate` run on
  the server — but only ever at deployment time, not on demand.
- No Node on the server: the interface is built in GitHub Actions and arrives ready-made on the
  `deploy` branch that Plesk pulls. There the Laravel directory sits at the root and the SPA in its
  `public/`.
- PHP 8.5, MariaDB, Plesk as the control panel (document root configurable per domain to `public/`).
- `max_execution_time` 180 seconds, configurable up to 600; `memory_limit` 512 MB, 512 MB RAM. The
  daily series run and the CSV import still work in batches and are resumable — a deployment action
  has its own, shorter time budget.
- No long-running processes — no queue workers, everything periodic via cron.
- Backup every 24 h by the host. Uploads live outside the deploy directory so that a release does
  not overwrite them.
- List-valued fields (`tags`, `blocksWorkplaceIds`, `blockedWorkplaceIds`, `blocksWorkplacesWithTag`)
  are normalised into their own tables rather than JSON columns — indexable and independent of the
  MariaDB version.

## Views

The existing system serves as the UI reference, see `Kalenderansicht Alle Arbeitsplätze Tag.png`,
`Kalenderansicht alle arbeitsplätze woche.png` and `Kalenderansicht einzelner arbeitsplatz.png`.

The calendar component is built in-house, not bought in.

### Overview map with current occupancy

- based on an .svg with attributes (e.g. id="tisch-4")
- The SVG is deployed as a file (not managed through the application). The `id` attributes correspond
  to the workplace IDs. Elements without a matching workplace are rendered neutrally, workplaces
  without an element do not appear on the map — neither is an error.
- Colour-coding of the workplaces (free/occupied/broken/disabled)
  - "occupied" = a booking overlaps the current moment, or the workplace is blocked at that moment
    by a booking on another workplace
  - DEFECT and DISABLED take precedence over free/occupied
- Hovering a workplace shows details and a link to book it (if permitted)
- Auto-refresh every 60 seconds

### Creating a booking

- Selecting the workplace (dropdown with search)
- Display of the workplace details (name, description (markdown, formatted), usage rules,
  location, wiki link, status, tags)
- Date selection (dropdown with today, tomorrow, ... max days into the future)
  - the number of entries follows from `maxBookingEndOffsetDays` of the area or the global
    configuration
  - with `noTimeRestrictions` a free date picker is shown instead
- Time selection as a horizontal timeline (initially between 08:00 and 21:00)
  - in 15-minute intervals
  - scrollable if necessary (the date selection simply scrolls to the matching range)
  - existing bookings are shown as coloured blocks
  - blocks caused by bookings on other workplaces as grey blocks
  - the booking about to be created is shown as a highlighted block
- Start and end time are what gets chosen. As a shortcut there is a duration dropdown with the
  permitted durations (based on workplace + area, cf. time rules), which sets the end to
  "start + duration".
  - Overnight bookings are captured through an end time on the following day, not through the
    duration dropdown. There is no end date: with one you could set the same day and thus an end
    before the start. Selectable are the end times at which the chargeable duration lands on one of
    the permitted durations.
  - the chargeable duration (excluding night hours) is derived from that and displayed; it is only
    relevant for validation against the maximum booking duration
- Collisions are checked and displayed in real time. The check in the frontend is a preview; binding
  is the check in the backend on save.
- Input fields for information about the person booking:
  - Name (text field, required, stored as a cookie)
  - Contact (text field, required, stored as a cookie, e.g. email or phone)
- Checkbox "usage rules read" (required, only if the workplace has usage rules)
- Button "create booking"
- If everything works out, the booking is created and the user is redirected to the "all workplaces"
  calendar view

### "All workplaces" calendar view

- Tabular / timeline, one row per workplace
- The first column is the "title", the name of the workplace; all further columns are hours / days
  (depending on the scale)
- The workplaces are grouped by area
- At the top: zoom level "day" / "week" / "month", plus "today", "tomorrow", arrows for paging and a
  date picker
- Scale per zoom level:
  - Day: columns are hours across the opening hours, blocks are placed to quarter-hour precision
  - Week: columns are the 7 days; each day cell is its own small timeline across the opening hours,
    on which the bookings sit as bars, to scale
  - Month: same as week, only with one column per day of the month and correspondingly narrower
    cells
- In week and month the selected day is highlighted as a column; weekends have a grey background
- In week and month the bar labels are mostly too short to read — hover with details is not optional
  there but the only way to the information
- The time axis can be scrolled forwards and backwards (arrows left/right)
- Bookings as coloured blocks (colour = colour of the area)
- Blocks of series instances carry a repeat icon
- Blocks caused by other bookings via `blockedWorkplaceIds` are shown as grey blocks
- The blocks show name + contact of the person booking (if permitted), truncated when there is too
  little space
- Hovering a block shows details and a link to edit it (pencil icon) (if permitted)
- Workplaces with a wiki link show a link icon next to the name
- Empty times are rendered as white areas and can be clicked to create a new booking. Workplace,
  date and start time of the cell are prefilled, along with the shortest permitted duration.
- Beyond the booking horizon (`maxBookingEndOffsetDays` of the area) the area is not clickable and
  shows no preview; hovering it states how many days in advance this area can be booked and from
  when this day becomes bookable.
- A vertical line marks the current time (if within the visible range)
- Optionally restrictable so that only one area is shown
- Times outside the opening hours are not rendered but skipped. An overnight booking therefore sits
  on the time axis as a continuous block, at the seam between the two days.
- Occupancy must not be recognisable by colour alone (additionally a label or a pattern)

### "Single workplace" calendar view

- The same UI component as for "all workplaces"
- No zoom level setting, but fixed to 1 month, 1 day per row
- Shows a calendar for a single workplace
- Workplace selection at the top (dropdown)
- First column: date
- Further columns: time in 15-minute intervals (horizontally scrollable)

### Admin views

Every bullet point is its own page.

- Role overview
- Edit role
- Area overview
- Edit area
- Workplace overview (grouped by area)
- Edit workplace
- Edit global configuration
- Floor plan: which one the overview map uses, replacing it, and where it and the configured
  workplaces disagree
- Recurring booking (for admins) (to be implemented later)

## Models

### User roles

There are only "user roles", used by several users, no "users". Examples: "Mitglied" / "Admin" /
"Anonym". The bookings contain name + contact, which is how the actual user can be reached.

Anonymous users get the "Anonym" role until they log in. That role is marked by an `isAnonymous`
flag, not by its name; exactly one role carries the flag, it has no password and cannot be deleted.

- ID (string, stable, immutable)
- Name (string, renameable)
- Password (stored salted and hashed)
- Permissions:
  - View bookings, including the name of the person booking (boolean, `viewBookings`)
  - Additionally view the contact details of the person booking (boolean, `viewBookingsDetails`)
  - Create, change and delete bookings (boolean, `manageBookings`)
  - No restriction on booking duration and horizon (boolean, `noTimeRestrictions`)
  - Manage booking series (boolean, `manageBookingSeries`)
  - Change workplaces (boolean, `manageWorkplaces`)
  - Change areas (boolean, `manageAreas`)
  - Change user roles and global configuration (boolean, `manageRoles`)

There is no notion of ownership on bookings: `manageBookings` permits creating, changing and deleting
_any_ booking, no matter which other user made it — there are, after all, only "user roles".

At least one role must have `manageRoles` at all times; the last such role can neither be deleted nor
stripped of that permission.

### Workplace

- ID (string)
- Name (string)
- Description (string, markdown)
- Usage rules (string, markdown, optional)
- Status (string, enum: "OK", "DEFECT", "DISABLED")
- Location (string, "Raum 3")
- Reference to area (string, areaId)
- Wiki link (string, format: uri)
- Maximum booking duration (int, optional, overrides the area's if set)
- Blocks workplaces (list of IDs, `blocksWorkplaceIds`)
- Blocks workplaces by tag (list of tags, `blocksWorkplacesWithTag`; workplaces carrying these tags
  are blocked)
- List of tags (`tags`, e.g. "lärmig")
- Order (int)

Markdown fields are restricted to a safe subset when rendered: no HTML, no scripts, no external
images.

Tags are stored without a leading `#`, are free text and are compared case-insensitively.

Broken workplaces are displayed but not bookable (`status` = DEFECT).

Disabled workplaces (`status` = DISABLED) are not bookable and are only displayed if the user role
may "change workplaces" (`manageWorkplaces`).

DEFECT and DISABLED only prevent new bookings. Existing bookings remain valid and continue to block.

A workplace can only be deleted if no booking with an end time in the future refers to it. On
deletion it is removed from the `blocksWorkplaceIds` of all other workplaces.

### Area

- ID
- Name (string)
- Colour (string)
- Maximum booking duration (minutes, integer)
- Maximum booking into the future (days, `maxBookingEndOffsetDays`, optional, overrides the global
  value)
- Allow overnight bookings (boolean, `allowNightlyActivities`) — bookings may span the night. Start
  and end still lie within the opening hours.
- Order (int)

An area can only be deleted if no workplaces are assigned to it.

### Booking

- ID
- User role of the creator (reference to a role ID)
- IP address of the creator (visible only with `manageRoles`, deleted after 90 days)
- Time of creation
- Reference to workplace (string, `workplaceId`)
- Also blocks (list of workplace IDs, `blockedWorkplaceIds`)
- Name (string, stored as a cookie)
- Contact (string, stored as a cookie)
- Usage rules confirmed (boolean)
- Start day/time (DateTime)
- End day/time (DateTime)
- Series ID (optional, if part of a booking series)

#### Blocking

`blockedWorkplaceIds` is computed by the backend when a booking is created or changed and stored on
the booking (a snapshot): the union of

- `blocksWorkplaceIds` of the workplace and
- all workplaces that at that moment carry a tag from the workplace's `blocksWorkplacesWithTag`.

The workplace's own ID is not part of the list. The field is never supplied by the client —
otherwise anyone could block arbitrary workplaces.

It follows that:

- Blocking is not transitive (A blocks B, B blocks C -> A does not implicitly block C as well)
- Changes to blocking rules and tags have no effect on existing bookings. "No collision" thereby
  remains a lasting promise.
- A newly created workplace with a matching tag is not blocked by already existing bookings

#### Collision

A new booking must not overlap an existing booking. A collision exists if the time ranges overlap
AND at least one of the following conditions holds:

- `new.workplaceId` equals `existing.workplaceId`
- `new.workplaceId` is contained in `existing.blockedWorkplaceIds`
- `existing.workplaceId` is contained in `new.blockedWorkplaceIds`

The tag rules no longer appear here: they were already resolved into the respective booking's
`blockedWorkplaceIds` when it was created.

Time ranges are compared half-open (`[start, end)`): 10:00–11:00 does not collide with 11:00–12:00.

Two bookings that block the same third workplace do _not_ collide with each other — only the third
one is blocked.

When a booking is changed, it is itself excluded from the check.

Collision check and save run in a transaction, with a lock on the affected workplaces, so that two
simultaneous requests do not both get through.

#### Time rules

Bookings can be made to quarter-hour precision and, where applicable, across several days (cf.
maximum booking duration). Start and end lie on the 15-minute grid, the duration is at least 15
minutes.

Booking happens via start and end time. The chargeable duration is derived from those and serves only
for validation against the maximum booking duration.

If `allowNightlyActivities` = true, bookings may last longer than the opening hours (08:00 to 21:00)
and then count as "overnight". The night hours are not counted towards the booking duration limit.
Only the time within the opening hours is charged; a booking from Friday 20:00 to Saturday 09:00
counts as 2 hours.

Furthermore:

- The maximum booking duration is the workplace's if set, otherwise the area's.
- Permitted durations in the dropdown (truncated at the maximum, the maximum itself is always
  selectable): full hours up to 24 hours, after that in steps of 24 hours.
- Without `allowNightlyActivities`, start and end must fall on the same day.
- Start and end must lie within the opening hours, including for areas with
  `allowNightlyActivities`.
- The end may lie at most `maxBookingEndOffsetDays` days in the future (area, otherwise the global
  value).
- When creating, the end time must lie in the future; the start may lie in the past. Someone who sat
  down first and books afterwards enters the time they actually began. Only a booking that is over
  by the time it is entered is refused — it would occupy nothing any more.
- Bookings whose end time lies in the past can no longer be changed or deleted.
- `noTimeRestrictions` lifts the maximum booking duration and `maxBookingEndOffsetDays` — but not the
  opening hours, not the 15-minute grid and not the ban on newly booking a past period.

Times are stored as UTC and displayed in Swiss time (a global configuration option). All date and
time values in the API are UTC with an explicit `Z`.

### Booking series

Only with `manageBookingSeries`.

- Series ID
- Reference to workplace (`workplaceId`)
- Name + contact (copied onto every instance)
- Interval (WEEKLY, MONTHLY)
- Interval count (int, e.g. every 2 weeks)
- Start time + date of the first instance (DateTime)
- End time + date of the first instance (DateTime)
- End day (Date, optional)
- Instantiated until (Date)

Start and end time are taken as local time of day, not as UTC — a weekly series at 09:00 stays at
09:00 local time across a DST change.

MONTHLY means the same day of the month. Months without that day (e.g. the 31st in February) are
skipped.

When a booking series is created, all instances are generated as "bookings" up to 1 year ahead, which
is recorded in the "instantiated until" field. If already existing bookings collide with the new
series, this is shown as a warning, the series is created anyway, and the colliding instances are
left out.

Series instances are not subject to `maxBookingEndOffsetDays`, otherwise they could not be created a
year in advance.

Once a day all booking series are checked and all instances between "instantiated until" and
"today + 1 year" are created. Afterwards "instantiated until" is updated to "today + 1 year". The run
is idempotent and guarded against concurrent execution.

When a series is changed, the future instances are reconciled rather than deleted and recreated:
occurrences that still exist are updated in place and keep their ID, dropped ones disappear, new ones
are added. Past and running instances remain untouched.

Changing an individual instance by hand detaches it from the series. Detached instances are left
alone when the series is changed, and the beat they once sat on is not refilled. The same holds for
an individually deleted instance: the cancelled occurrence does not come back.

When a series is deleted, all instances with a start time in the future are deleted, including
detached ones; past ones remain as standalone bookings.

### Global configuration values

Changeable only with `manageRoles`, readable by everyone (the frontend needs them for rendering).

- Opening hours (e.g. 08:00 to 21:00), valid for all weekdays
- Maximum booking into the future (days, `maxBookingEndOffsetDays`)
- Timezone (default `Europe/Zurich`)

The time grid is fixed at 15 minutes and not configurable.

## Integrations

- On the website as a list of upcoming events
  (cf. https://reservation.quartierwerkstatt-viktoria.ch/coming_up.php?room=%25Kurs%25&max=50)
- Welcome tablet (map view)
- Basement tablet (area view)
- .ical subscription (model reference to follow, implemented last)

## Use cases

- Booking in advance
- On site at the tablet
- Via QR code and smartphone
