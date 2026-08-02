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
Englisch. Kommentare erklären das _Warum_, nicht das _Was_.

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
  Öffnungszeiten _eines_ Tages. Die Tagesansicht hat eine davon je Zeile, die
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
  `?arbeitsplatz=` mit und wird _nur_ aus der Adresse gelesen. Hin führt der Name
  in der Arbeitsplatzzeile — wer einen Arbeitsplatz meint, hat ihn dort vor sich;
  eine Auswahlliste in der Kopfleiste zählte dieselben Namen ein zweites Mal auf.
  Zurück führt ein Knopf, den nur diese Ansicht in der Kopfleiste zeigt. Damit das
  Blättern den Arbeitsplatz nicht abräumt, schreibt `date-in-url.ts` mit
  `queryParamsHandling: 'merge'`.
- **Die Detailkarte klappt die Plattform auf, nicht wir.** Der Balken ist ein
  `<button popovertarget>`, die Karte das benannte Popover — Umschalten, Escape,
  Klick daneben und Tastatur kommen vom Browser. Daraus folgen zwei Dinge, die
  sonst wie Umwege aussehen: die Karte steht _neben_ dem Balken statt in ihm
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
- **Der Grundriss ist eine ausgelieferte Datei, kein Quelltext.**
  `frontend/public/karte.svg` wird zur Laufzeit geholt und von Hand in den Baum
  gehängt — nicht über `innerHTML`, weil Angulars Bereinigung `id`-Attribute
  entfernt und genau die die Zuordnung zu den Arbeitsplätzen tragen. Wer die
  Werkstatt umstellt, tauscht die Datei und baut nichts neu; nebenbei bleiben
  ihre 300 kB aus dem Bündel jeder anderen Ansicht.
- **Die Figur wird nicht gezeichnet, sondern geliehen.** Der Plan bringt unter
  `#figur` eine mit, im Massstab der Karte und in ihrer Farbe. Nach dem Messen
  wandert sie in die `defs` — dort wird sie nicht mehr gezeichnet, bleibt für
  `<use>` aber erreichbar. Erst messen, dann verstecken: was nicht gezeichnet
  wird, hat auch keinen Kasten. Ein eigener Pfad wäre eine zweite Wahrheit und
  wanderte beim nächsten Austausch der Datei nicht mit.
- **Die Karte bekommt genau das Seitenverhältnis ihrer `viewBox`**, statt dass
  das SVG sich in einen beliebigen Kasten einpasst. Die Figuren stehen in
  Prozent der Kartenfläche; bliebe rundherum ein Rand, zeigten dieselben
  Prozente daneben. Die Karte nimmt darum die volle Breite und wird so hoch,
  wie das Verhältnis es verlangt — beim hochkant gezeichneten Grundriss höher
  als das Fenster, also wird gescrollt. Lieber gross und geblättert als ganz
  sichtbar und unleserlich.
- **Die Karte ist keine dritte Zoomstufe.** Sie hat kein Datum, sondern den
  Augenblick, und fragt ihn jede Minute neu nach — darum steht ihr Knopf neben
  dem Umschalter und nicht in ihm, und ihre Kopfleiste trägt weder Blättern
  noch Datumswahl.

## Umgebung

Vor jedem Frontend-Befehl die richtige Node-Version aktivieren:

```bash
. ~/.nvm/nvm.sh && nvm use
```

Composer ist in `backend/composer.json` auf `platform.php = 8.3` festgenagelt.
Das Hosting kann inzwischen 8.5, die Fessel schützt also nicht mehr vor einer zu
neuen Auflösung — sie hält `composer.lock` aber unabhängig davon, welche
PHP-Version gerade lokal installiert ist. Nie ersatzlos entfernen; wer sie
anhebt, hebt sie auf die Version, die für die Domain eingestellt ist.

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

hosttech "Smart Deal" mit Plesk: PHP 8.5, MariaDB, 180 Sekunden Ausführungszeit
(bis 600 einstellbar), keine dauerhaft laufenden Prozesse. Alles Periodische
läuft über Cron, nicht über Queue-Worker.

**Kein SSH, aber Shell zum Bereitstellungszeitpunkt.** Plesk zieht per Git von
GitHub und führt danach hinterlegte Shell-Befehle aus. Das ist der einzige
Zugang zur Kommandozeile — es gibt keine Sitzung, in der man nachschauen könnte,
und was die Bereitstellungsaktionen ausgeben, steht nur im Plesk-Log.

**Plesk zieht den Branch `deploy`, nicht `main`.** Auf dem Server läuft kein
Node, die Oberfläche muss also gebaut ankommen. `.github/workflows/deploy.yml`
baut sie bei jedem Push auf `main` und schreibt `backend/` mitsamt der SPA in
`public/` auf `deploy` — das Laravel-Verzeichnis liegt dort in der Wurzel, der
Document Root zeigt auf dessen `public/`. Der Branch wird angehängt und nie
umgeschrieben, weil Plesks Klon einen Force-Push nicht verdaut.

`vendor/` reist nicht mit: `composer install` läuft auf dem Server. Als
Bereitstellungsaktion steht in Plesk nur eine Zeile:

```
bash deploy.sh
```

Alles Weitere macht `backend/deploy.sh` — im Repository und nicht im
Plesk-Formular, weil sich Schritte in einem Textfeld weder vergleichen noch
zurückrollen lassen. Drei Dinge stecken darin, die man von aussen nicht sieht:

- **`composer install` kommt vor `artisan down`, nicht danach.** Beim ersten
  Lauf gibt es noch kein `vendor/`, `artisan` wäre also gar nicht startbar. Die
  Wartungsseite wird deshalb nur gestellt, wenn schon eine Installation da ist.
- **Der volle PHP-Pfad**, weil das blosse `php` in Plesks Aktionen das
  System-PHP meint und nicht das der Domain.
- **Nach einem Fehler bleibt die Wartungsseite stehen.** Ab der Migration ist
  der Code neu und das Schema womöglich noch alt; eine kaputte Anwendung
  auszuliefern wäre die schlechtere Auskunft als eine abwesende.
- **Composer ist optional.** In der Bereitstellungsaktion ist er nicht
  zuverlässig erreichbar — Plesks eigener liegt je nach Installation woanders,
  und der `PATH` einer Aktion ist kürzer als der einer Anmeldeschale. Fehlt er,
  läuft die Bereitstellung trotzdem durch, solange `vendor/` zum aktuellen
  `composer.lock` gehört; die Prüfsumme dazu liegt in
  `storage/framework/composer-lock.sha256`. Erst wenn sich die Abhängigkeiten
  geändert haben, hält das Skript an und verlangt den Composer-Knopf in Plesk.
  Einen bekannten Pfad kann man der Aktion mit `COMPOSER_BIN=… bash deploy.sh`
  mitgeben.

`.env` und der Inhalt von `storage/` liegen nicht im Repository und werden
einmalig von Hand angelegt; die Bereitstellung fasst sie nicht an. Fotos liegen
unter `storage/app/public` und werden über den Symlink `public/storage`
ausgeliefert, den `storage:link` bei jeder Bereitstellung erneuert.

## Arbeitsweise

- Formatierer (`pint`, `prettier`) einmal am Schluss laufen lassen, nicht nach
  jeder Änderung — jeder Lauf löst sonst grosse Datei-Meldungen aus.
- Browser-Verifikation nur, wo sie etwas findet: bei Logik und Geometrie ja, bei
  reinen CSS-Anpassungen nachfragen statt Screenshots zu schiessen.
- Bei einem neuen, in sich geschlossenen Auftrag lohnt sich eine frische Sitzung
  mehr als das Fortführen dieser — der Verlauf wird sonst bei jedem Turn
  mitgeschickt.

## Offen

- Deploy-Test auf hosttech (grösstes ungetestetes Risiko): läuft `composer` in
  Plesks Bereitstellungsaktionen, und darf `symlink()` für `storage:link`?
- Xdebug ist auf dem Server geladen (`50-xdebug.ini`). Wenn `xdebug.mode` nicht
  `off` ist, kostet das spürbar Leistung.
- Die vier `_3d-drucker-*` in `frontend/public/karte.svg`: auf dem Plan stehen
  vier nebeneinander, die Konfiguration kennt neben dem XL nur drei. Bis das
  entschieden ist, bleiben sie leer — kein Fehler, aber auch keine Auskunft.
  Die übrige Umbenenn-Tabelle in `spec/karte-kennungen.markdown` ist erledigt.
- Farbige Markierung der Zustände auf der Karte (frei/belegt/defekt/deaktiviert)
- Serienbuchungen
- Abo-Link in der Verwaltung mit Filter (Bereich, Arbeitsplatz) — der Feed kann
  es, die Oberfläche bietet bisher nur den ungefilterten Kalender an
