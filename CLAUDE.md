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
cd frontend && npx ng serve                   # SPA auf :4200, proxyt /api
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

## Arbeitsweise

- Formatierer (`pint`, `prettier`) einmal am Schluss laufen lassen, nicht nach
  jeder Änderung — jeder Lauf löst sonst grosse Datei-Meldungen aus.
- Browser-Verifikation nur, wo sie etwas findet: bei Logik und Geometrie ja, bei
  reinen CSS-Anpassungen nachfragen statt Screenshots zu schiessen.
- Zusammenfassungen kurz halten: was gemacht wurde, was überrascht hat, was offen
  bleibt. Keine Wiederholung des Diffs.
- Bei einem neuen, in sich geschlossenen Auftrag lohnt sich eine frische Sitzung
  mehr als das Fortführen dieser — der Verlauf wird sonst bei jedem Turn
  mitgeschickt.

## Offen

- Deploy-Test auf hosttech (grösstes ungetestetes Risiko)
- Monatsansicht, Übersichtskarte, Admin-Ansichten
- Ansichten zum Bearbeiten von Bereichen / Arbeitsplätzen (letzteres mit image-upload)
- Serienbuchungen, iCal-Abo (Modellreferenz steht aus)
