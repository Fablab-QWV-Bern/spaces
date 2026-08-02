# Reservationssystem Quartierwerkstatt

Buchungssystem für Arbeitsplätze einer Quartierwerkstatt. Ersetzt ein bestehendes
System, dessen Oberfläche als Referenz dient (Screenshots in `spec/`).

## Aufbau

- `spec/` — Fachspec (`Reservationsystem.markdown`) und API-Vertrag (`reservation-api.yml`)
- `backend/` — Laravel 13, PHP 8.3
- `frontend/` — Angular 22, SPA gegen die REST-API
- `docker-compose.yml` — MariaDB für die Entwicklung

## Sprache

Kommentare, Commit-Messages und Oberfläche auf **Deutsch**. Bezeichner im Code auf
Englisch. Kommentare erklären das *Warum*, nicht das *Was*.

## Die Spec ist der Vertrag

`spec/reservation-api.yml` ist massgebend, nicht der Code. Wer eine Antwortform
ändert, ändert zuerst die Spec.

- Spectator prüft in jedem Feature-Test Anfrage und Antwort gegen die YAML.
  Abweichungen machen die Suite rot.
- Der Angular-Client wird generiert (`npm run api:generate`), nicht geschrieben.
  Modelle wie `BookingWrite` oder `Error` kommen von dort — keine handgeschriebenen
  Formen wie `{ message?: string }`.
- Das generierte `Error`-Modell verdeckt das globale `Error`; als `ApiError`
  importieren.

## Architekturentscheidungen, die man nicht aus dem Code herausliest

- **Validierung nur im Backend.** Alle Buchungsregeln liegen in
  `backend/app/Domain/Booking/`. Das Frontend prüft ausschliesslich Pflichtfelder
  und fragt für alles Weitere `POST /bookings/validate`. Regeln nie im Frontend
  nachbauen.
- **Es gibt keine Benutzer, nur Benutzerrollen.** Authentifiziert wird als Rolle,
  deren Kennwort sich mehrere Personen teilen. `Role` ist das Authenticatable.
- **Blockierungen sind ein Snapshot.** Beim Anlegen einer Buchung werden
  `blocksWorkplaceIds` und die per Tag getroffenen Plätze aufgelöst und auf der
  Buchung festgehalten. Spätere Konfigurationsänderungen berühren bestehende
  Buchungen nicht.
- **Zwei Buchungen, die denselben dritten Arbeitsplatz blockieren, kollidieren
  nicht.** Eine Implementierung als Mengenschnitt wäre falsch.
- **Zeiten sind UTC** — mit einer Ausnahme: `booking_series` speichert lokale
  Wanduhrzeit, damit eine Serie über die Zeitumstellung hinweg zur selben Uhrzeit
  stattfindet. Diese Spalten sind bewusst ungecastet.
- **Farben werden abgeleitet, nicht notiert.** `frontend/src/_colors.scss` hält
  sieben Ausgangsfarben; alles andere entsteht daraus mit `color-mix` und steht
  als CSS-Variable auf `:root`. Im übrigen Code kommt kein Hex-Wert mehr vor —
  wer einen schreibt, hat entweder einen Namen übersehen oder braucht einen
  neuen in der Palette. Zwei Regeln stecken in den Mischungen: gemischt wird in
  `oklab`, und heller geht über `--paper`, dunkler über Schwarz. Über `--ink`
  abzudunkeln zöge warme Töne ins Graue. Die Grautöne kommen nicht aus `--ink`
  selbst, sondern aus `--shade` — `--ink` mit einem Hauch Akzent, weil ein
  reiner Verlauf nach Weiss in der Mitte seinen blauen Stich verliert.
- **Symbole sind eingebettetes SVG in `currentColor`**, keine Icon-Font und kein
  Emoji. Ein farbiges Emoji brächte eine Farbe mit, die keine Palette kennt, und
  sähe auf jedem System anders aus; eine Font kostete entweder einen Request zu
  Google oder mehrere Megabyte Auslieferung und zeigte bis dahin den
  Ligaturnamen im Klartext. Die Pfade stehen trotzdem nicht von Hand da:
  `frontend/scripts/generate-icons.mjs` holt sie aus `lucide-static` und
  schreibt `icon-paths.ts` — abgetippte Pfaddaten gehen lange gut und dann
  still schief, weil Lucide Symbole zwischendurch neu zeichnet. Ein neues
  Symbol ist eine Zeile in der `ICONS`-Tabelle des Skripts plus
  `npm run icons:generate`. `lucide-angular` wäre der offensichtliche Weg,
  hört aber bei Angular 21 auf; als Entwicklungsabhängigkeit stellt sich die
  Frage nicht, in den Bundle kommt nur die erzeugte Tabelle.
- **Zwei Platzierungsarten im Kalender.** Blöcke sitzen auf benannten Rasterlinien
  (`grid-column: t0900 / t1300`), die Formularvorschau und die Jetzt-Linie auf
  Prozentwerten. Beide bauen auf `visibleRange()` in
  `frontend/src/app/calendar/time-axis.ts` auf — die Beschneidungslogik existiert
  nur einmal.
- **Eine Zelle für alle Zoomstufen.** `DayTrack` ist ein Zeitstrahl über die
  Öffnungszeiten *eines* Tages. Die Tagesansicht hat eine davon je Zeile, die
  Wochenansicht sieben. Weil jede Zelle ihr eigenes Raster mitbringt, meint
  `t0900` überall dasselbe; die Linien brauchen keine Tagesangabe. Was sich
  zwischen den Stufen unterscheidet, ist nur die Dichte — sie wird über
  CSS-Variablen gesetzt (`--columns`, `--bar-padding`, `--quarter-line`), nicht
  über Fallunterscheidungen im Code.
- **Jede Zoomstufe ist eine eigene Route** (`/tag`, `/woche`), damit eine Ansicht
  verlinkbar ist und der Zurück-Knopf zur vorigen Stufe führt. Das Datum reist als
  `?datum=` mit; `date-in-url.ts` hält es in beide Richtungen synchron.
- **In der Woche wird nicht gebucht.** Eine Viertelstunde wäre dort keine zwei
  Pixel breit. Ein Klick auf freie Fläche öffnet stattdessen den Tag.
- **Die Einzelansicht (`/arbeitsplatz`) ist keine dritte Zoomstufe**, sondern die
  Tagesansicht mit vertauschten Achsen: ein Arbeitsplatz über allen Tagen des
  Monats statt ein Tag über allen Arbeitsplätzen. Dieselbe Zelle, derselbe
  Massstab — darum wird dort gebucht wie im Tag. Der Arbeitsplatz reist als
  `?arbeitsplatz=` mit und wird *nur* aus der Adresse gelesen. Hin führt der Name
  in der Arbeitsplatzzeile — wer einen Arbeitsplatz meint, hat ihn dort vor sich;
  eine Auswahlliste in der Kopfleiste zählte dieselben Namen ein zweites Mal auf.
  Zurück führt ein Knopf, den nur diese Ansicht in der Kopfleiste zeigt. Damit das
  Blättern den Arbeitsplatz nicht abräumt, schreibt `date-in-url.ts` mit
  `queryParamsHandling: 'merge'`.
- **Die Detailkarte klappt die Plattform auf, nicht wir.** Der Balken ist ein
  `<button popovertarget>`, die Karte das benannte Popover — Umschalten, Escape,
  Klick daneben und Tastatur kommen vom Browser. Daraus folgen zwei Dinge, die
  sonst wie Umwege aussehen: die Karte steht *neben* dem Balken statt in ihm
  (ein `<button>` darf keine Schaltfläche enthalten, und die Karte hat eine),
  und `CalendarBlock` trägt `display: contents`, damit der Balken das
  Rasterelement der Zelle bleibt. Positioniert wird über CSS Anchor Positioning;
  der implizite Anker aus `popovertarget` greift in Chrome nicht, darum das
  ausdrückliche `anchor-name: --block`. Kein Nachbau mit eigenen Zeigerhandlern —
  das war einmal da und ist bewusst verschwunden.
- **Die anonyme Rolle darf `manageRoles` nicht bekommen.** Die Spec verlangt das
  nicht, aber mit diesem Recht könnte sich jeder ohne Anmeldung selbst zum
  Verwalter machen. Die Invariante „mindestens eine Rolle hat `manageRoles`"
  zählt dadurch nur Rollen, an denen eine Anmeldung möglich ist.
- **Die Verwaltung hat keinen Route-Guard.** `frontend/src/app/admin/` lädt die
  Sitzung und zeigt einen Hinweis, wenn die Rolle nicht darf. Ein Guard könnte nur
  wiederholen, was das Backend ohnehin durchsetzt — und müsste raten, solange die
  Sitzung noch lädt.
- **Foto-URLs sind relativ** (`/storage/…`). API, Ablage und SPA liegen auf
  demselben Host; eine absolute URL käme aus `APP_URL`, und ein falsch gesetztes
  `APP_URL` auf dem Hosting würde jedes Foto auf einmal unerreichbar machen.
- **Bilder rechnet GD**, nicht eine Bibliothek aus Composer: das Hosting bringt GD
  mit, und `vendor/` reist per FTP mit. Vorschaubild und verkleinertes Original
  entstehen beide aus der Originaldatei — zweimal skalieren kostet Schärfe.
- **Der iCal-Feed rendert immer als anonyme Rolle**, auch mit Sitzungscookie. Ein
  Kalenderclient hat keines; würde der Feed die angemeldete Rolle berücksichtigen,
  zeigte die Vorschau im Browser mehr als das Abo danach liefert. So ist er für
  alle dasselbe Dokument, und ein weitergegebener Link kann keine Kontaktdaten
  ausspielen. Er prüft `viewBookings` deshalb selbst statt über die Middleware.
- **Je Buchung ein VEVENT, kein RRULE** — auch wenn es Serien gibt. Eine
  Serieninstanz ist eine eigene Buchung mit eigener ID; RRULE verlangte zusätzlich
  Lokalzeit mit mitgelieferter VTIMEZONE. Solange jede Instanz einzeln in der
  Datenbank steht, sind UTC-Zeitpunkte die ehrlichere Abbildung.

## Umgebung

Vor jedem Frontend-Befehl die richtige Node-Version aktivieren:

```bash
. ~/.nvm/nvm.sh && nvm use
```

Composer ist in `backend/composer.json` auf `platform.php = 8.3` festgenagelt, weil
das Hosting nicht mehr kann. Lokal läuft eine neuere Version — nie entfernen.

## Befehle

```bash
docker compose up -d                          # MariaDB
cd backend && php artisan serve               # API auf :8000
cd frontend && npx ng serve                   # SPA auf :4200, proxyt /api und /storage
```

Einmalig, damit hochgeladene Fotos ausgeliefert werden:

```bash
cd backend && php artisan storage:link
```

```bash
cd backend && ./vendor/bin/pest               # Backend-Tests
cd frontend && npx ng test --watch=false      # Frontend-Tests
cd frontend && npm run api:generate           # Client aus der Spec
```

Testdaten neu aufsetzen (löscht auch die Sessions, danach neu anmelden):

```bash
cd backend && php artisan migrate:fresh --seed --force && php artisan db:seed --class=BookingSeeder --force
```

Der `BookingSeeder` prüft seine Zeilen gegen die Kollisionsregeln und überspringt
widersprüchliche. Eine übersprungene Zeile beim Lauf ist erwartet.

Anmeldedaten der Entwicklungsumgebung: `Mitglied` / `mitglied-kennwort`,
`Admin` / `admin-kennwort`.

## Hosting

hosttech "Smart Deal": **kein SSH**, PHP maximal 8.3, MariaDB, 60 Sekunden
Ausführungszeit, keine dauerhaft laufenden Prozesse. Deployment über FTP mit
mitgeliefertem `vendor/`, Migrationen über einen Cron- bzw. Web-Trigger. Alles
Periodische läuft über Cron, nicht über Queue-Worker.

Fotos liegen unter `storage/app/public` und werden über den Symlink
`public/storage` ausgeliefert. Den legt sonst `php artisan storage:link` an — ohne
SSH braucht es dafür denselben Trigger wie für die Migrationen. Ungetestet.

## Arbeitsweise

- Formatierer (`pint`, `prettier`) einmal am Schluss laufen lassen, nicht nach
  jeder Änderung — jeder Lauf löst sonst grosse Datei-Meldungen aus.
- Browser-Verifikation nur, wo sie etwas findet: bei Logik und Geometrie ja, bei
  reinen CSS-Anpassungen nachfragen statt Screenshots zu schiessen.
- Bei einem neuen, in sich geschlossenen Auftrag lohnt sich eine frische Sitzung
  mehr als das Fortführen dieser — der Verlauf wird sonst bei jedem Turn
  mitgeschickt.

## Offen

- Deploy-Test auf hosttech (grösstes ungetestetes Risiko), inklusive
  `public/storage`-Symlink
- Monatsansicht, Übersichtskarte
- Serienbuchungen
- Abo-Link in der Verwaltung mit Filter (Bereich, Arbeitsplatz) — der Feed kann
  es, die Oberfläche bietet bisher nur den ungefilterten Kalender an
