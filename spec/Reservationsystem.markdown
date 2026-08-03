# Reservationssystem

## Stack

- Backend: PHP mit Laravel
- Persistence: MariaDB
- SCSS
- Frontend: Angular mit Signals, als SPA gegen die REST-API. Inertia mit React wurde erwogen und
  verworfen: Website-Liste, iCal-Abo und die beiden Tablets brauchen die API ohnehin, und die
  Kiosk-Ansichten laufen dauerhaft mit periodischem Nachladen — dafür ist eine SPA das passendere
  Modell. Die Angular-Major-Version wird gepinnt, nicht "latest".
- Validierung ausschliesslich im Backend. Das Frontend prüft nur Pflichtfelder und Rasterrastung und
  fragt für alles Weitere den Server (`POST /bookings/validate`), damit die Buchungsregeln nur einmal
  existieren.
- OpenAPI für API-Spec
- Tests mit Pest / PHPUnit, insbesondere für Kollisionsregeln, anrechenbare Dauer über Nacht und die
  Instanziierung von Serien über die Zeitumstellung
- Laravel Scheduler (für die tägliche Instanziierung von Buchungsserien)

### Hosting

hosttech Webhosting, Paket "Smart Deal" (CHF 6.90/Mt.). Daraus folgende Randbedingungen:

- **Kein SSH, aber Shell zum Bereitstellungszeitpunkt.** Plesk zieht per Git von GitHub und führt
  danach hinterlegte Shell-Befehle aus. `composer install` und `php artisan migrate` laufen darum
  auf dem Server — nur eben ausschliesslich beim Bereitstellen, nicht auf Zuruf.
- Kein Node auf dem Server: Die Oberfläche wird in GitHub Actions gebaut und landet fertig auf dem
  Branch `deploy`, den Plesk zieht. Dort liegt das Laravel-Verzeichnis in der Wurzel und die SPA in
  dessen `public/`.
- PHP 8.5, MariaDB, Plesk als Control Panel (Document Root pro Domain auf `public/` setzbar).
- `max_execution_time` 180 Sekunden, bis 600 einstellbar; `memory_limit` 512 MB, 512 MB RAM. Der
  tägliche Serien-Lauf und der CSV-Import arbeiten trotzdem in Batches und wiederaufsetzbar — eine
  Bereitstellungsaktion hat ihr eigenes, kürzeres Zeitbudget.
- Keine dauerhaft laufenden Prozesse — keine Queue-Worker, alles Periodische über Cron.
- Backup alle 24 h durch den Hoster. Foto-Uploads liegen ausserhalb des Deploy-Verzeichnisses, damit
  ein Release sie nicht überschreibt.
- Listenwertige Felder (`tags`, `blocksWorkplaceIds`, `blockedWorkplaceIds`, `blocksWorkplacesWithTag`)
  werden als eigene Tabellen normalisiert, nicht als JSON-Spalten — indexierbar und unabhängig von
  der MariaDB-Version.

## Ansichten

Als UI-Referenz dient das bestehende System, siehe `Kalenderansicht Alle Arbeitsplätze Tag.png`,
`Kalenderansicht alle arbeitsplätze woche.png` und `Kalenderansicht einzelner arbeitsplatz.png`.

Die Kalenderkomponente wird selbst gebaut, nicht zugekauft.

### Übersichtskarte mit Jetzt-Belegung

- basierend auf .svg mit attributes (z.B. id="tisch-4")
- Das SVG wird als Datei deployed (nicht über die Anwendung verwaltet). Die `id`-Attribute entsprechen den
  Arbeitsplatz-IDs. Elemente ohne passenden Arbeitsplatz werden neutral dargestellt, Arbeitsplätze ohne Element
  erscheinen nicht auf der Karte — beides ist kein Fehler.
- Farbige Markierung der Arbeitsplätze (frei/belegt/defekt/deaktiviert)
    - "belegt" = eine Buchung überschneidet den aktuellen Zeitpunkt, oder der Arbeitsplatz ist zu diesem Zeitpunkt durch
      eine Buchung auf einem anderen Arbeitsplatz blockiert
    - DEFECT und DISABLED haben Vorrang vor frei/belegt
- Hover auf Arbeitsplatz zeigt Details an und Link zum Buchen (sofern berechtigt)
- Auto-Refresh alle 60 Sekunden

### Buchung erstellen

- Auswahl des Arbeitsplatzes (Dropdown mit Suchfunktion)
- Anzeige der Arbeitsplatz-Details (Name, Foto, Beschrieb (markdown, formatiert), Nutzungsregeln, Ort, Link auf Wiki,
  Status, Tags)
- Datumsauswahl (dropdown mit heute, morgen, ... max tage in die zukunft)
    - die Anzahl Einträge ergibt sich aus `maxBookingEndOffsetDays` des Bereichs bzw. der globalen Konfiguration
    - mit `noTimeRestrictions` wird stattdessen ein freier Datumspicker angezeigt
- Zeit-Auswahl als horizontale Zeitleiste (inital zwischen 8 Uhr und 21 Uhr)
    - mit 15-Minuten-Intervallen
    - scrollbar falls nötig (datumsauswahl scrollt einfach in den passenden bereich)
    - bestehende Buchungen werden als farbige Blöcke angezeigt
    - Blockierungen durch Buchungen auf anderen Arbeitsplätzen als graue Blöcke
    - zu erstellende Buchung wird als hervorgehobener Block angezeigt
- Gewählt werden Start- und Endzeit. Als Abkürzung gibt es ein Dauer-Dropdown mit erlaubten Dauern (basierend auf
  Arbeitsplatz + Bereich, vgl. Zeitregeln), das das Ende auf "Start + Dauer" setzt.
    - Buchungen über Nacht werden über ein Enddatum + Endzeit erfasst, nicht über das Dauer-Dropdown
    - die anrechenbare Dauer (ohne Nachtstunden) wird daraus abgeleitet und angezeigt; sie ist nur für die Validierung
      gegen die maximale Buchungsdauer relevant
- Kollisionen werden in Echtzeit geprüft und angezeigt. Die Prüfung im Frontend ist eine Vorschau; verbindlich ist die
  Prüfung im Backend beim Speichern.
- Eingabefelder für Infos über "Buchenden":
    - Name (Textfeld, Pflicht, als Cookie speichern)
    - Kontakt (Textfeld, Pflicht, als Cookie speichern, z.B. E-Mail oder Telefon)
- Checkbox "Nutzungsregeln gelesen" (Pflicht, nur falls der Arbeitsplatz Nutzungsregeln hat)
- Button "Buchung erstellen"
- Falls alles klappt, wird die Buchung erstellt und der Benutzer zur Kalenderansicht "Alle Arbeitsplätze" weitergeleitet

### Kalenderansicht "Alle Arbeitsplätze"

- Tabellarisch / Zeitstrahl, pro Arbeitsplatz eine Zeile
- Erste Spalte ist der "Titel"; Name des Arbeitsplatzes, alle weiteren Spalten sind Stunden / Tage (je nach Skalierung)
- Die Arbeitsplätze sind gruppiert nach Bereichen
- Oben: Zoomstufe "Tag" / "Woche" / "Monat", dazu "Heute", "Morgen", Pfeile zum Blättern und ein Datumspicker
- Skalierung je Zoomstufe:
    - Tag: Spalten sind Stunden über die Öffnungszeiten, Blöcke werden viertelstundengenau platziert
    - Woche: Spalten sind die 7 Tage; jede Tageszelle ist ein eigener kleiner Zeitstrahl über die Öffnungszeiten, auf
      dem die Buchungen massstabsgetreu als Balken liegen
    - Monat: gleich wie Woche, nur mit einer Spalte pro Tag des Monats und entsprechend schmaleren Zellen
- In Woche und Monat ist der gewählte Tag als Spalte hervorgehoben; Wochenenden sind grau hinterlegt
- In Woche und Monat sind die Beschriftungen der Balken meist zu kurz zum Lesen — Hover mit Details ist dort nicht
  optional, sondern der einzige Weg an die Information
- Die Zeitachse kann vor- und zurückgescrollt werden (Pfeile links/rechts)
- Buchungen als farbige Blöcke (Farbe = Farbe des Bereichs)
- Blöcke von Serien-Instanzen tragen ein Wiederholungs-Icon
- Blockierungen durch andere Buchungen via `blockedWorkplaceIds` werden als graue Blöcke angezeigt
- Die Blöcke zeigen Name + Kontakt des Buchenden an (sofern berechtigt), bei zu wenig Platz abgeschnitten
- Hover auf Block zeigt Details an und link zum Bearbeiten (Bleistift-Icon) (sofern berechtigt)
- Arbeitsplätze mit Wiki-Link zeigen ein Link-Icon neben dem Namen
- Leere Zeiten sind als weiße Flächen dargestellt und können angeklickt werden, um eine neue Buchung zu erstellen.
  Vorbelegt werden Arbeitsplatz, Datum und Startzeit der Zelle sowie die kürzeste erlaubte Dauer.
- Eine vertikale Linie zeigt die aktuelle Zeit an (sofern im sichtbaren Bereich)
- Optional einschränkbar, dass nur ein Bereich angezeigt wird
- Zeiten ausserhalb der Öffnungszeiten werden nicht dargestellt, sondern übersprungen. Eine Buchung über Nacht liegt
  damit als durchgehender Block auf der Zeitachse, an der Nahtstelle zwischen den beiden Tagen.
- Belegung darf nicht allein über Farbe erkennbar sein (zusätzlich Beschriftung oder Muster)

### Kalenderansicht "Einzelner Arbeitsplatz"

- Dieselbe UI-Komponente wie bei "Alle Arbeitsplätze"
- keine Zoomstufeneinstellung, sondern fix auf 1 monat, 1 tag pro zeile
- Zeigt einen Kalender für einen einzelnen Arbeitsplatz
- Oben Auswahl des Arbeitsplatzes (Dropdown)
- Erste Spalte: Datum
- Weitere Spalten: Zeit in 15-Minuten-Intervallen (horizontal scrollbar)

### Admin-Ansichten

Jeder Aufzählungspunkt ist eine eigene Seite.

- Rollenübersicht
- Rolle bearbeiten
- Bereichsübersicht
- Bereich bearbeiten
- Arbeitsplatzübersicht (gruppiert nach Bereichen)
- Arbeitsplatz bearbeiten
- Globale Konfiguration bearbeiten
- Serienbuchung (für Admins) (erst später implementieren)

## Modelle

### Benutzerrollen

Es gibt nur "Benutzerrollen", die von mehreren Benutzern verwendet werden, keine "Benutzer". Beispiele: "Mitglied" /
"Admin" / "Anonym". Die Buchungen beinhalten Name + Kontakt, womit der tatsächliche Benutzer kontaktiert werden kann.

Anonyme Benutzer erhalten die Rolle "Anonym", bis sie sich einloggen. Diese Rolle ist über ein Flag `isAnonymous`
gekennzeichnet, nicht über ihren Namen; genau eine Rolle trägt das Flag, sie hat kein Kennwort und ist nicht löschbar.

- ID (string, stabil, unveränderlich)
- Name (string, umbenennbar)
- Kennwort (gespeichert mit Salt und gehasht)
- Berechtigungen:
    - Buchungen anzeigen, inklusive Name des Buchenden (boolean, `viewBookings`)
    - Zusätzlich Kontaktangaben des Buchenden anzeigen (boolean, `viewBookingsDetails`)
    - Buchungen erstellen, ändern und löschen (boolean, `manageBookings`)
    - Keine Beschränkung von Buchungsdauer und Vorlauf (boolean, `noTimeRestrictions`)
    - Buchungsserien verwalten (boolean, `manageBookingSeries`)
    - Arbeitsplätze ändern (boolean, `manageWorkplaces`)
    - Bereiche ändern (boolean, `manageAreas`)
    - Benutzerrollen und globale Konfiguration ändern (boolean, `manageRoles`)

Es gibt kein Eigentümer-Konzept an Buchungen: `manageBookings` erlaubt das Erstellen, Ändern und Löschen *jeder*
Buchung, egal von welchem anderen Benutzer — es gibt ja nur "Benutzerrollen".

Mindestens eine Rolle muss jederzeit `manageRoles` besitzen; die letzte solche Rolle kann weder gelöscht noch um dieses
Recht gebracht werden.

### Arbeitsplatz

- ID (string)
- Name (string)
- Beschrieb (string, markdown)
- Nutzungsregeln (string, markdown, optional)
- Foto (optional, ein Bild, in der Admin-Ansicht hochgeladen; JPEG/PNG/WebP, max. 5 MB, Backend erzeugt zusätzlich ein
  Thumbnail und legt beides lokal auf der Disk ab)
- Status (string, Enum: "OK", "DEFECT", "DISABLED")
- Ort (string, "Raum 3")
- Referenz auf Bereich (string, areaId)
- Link auf Wiki (string, format: uri)
- Maximale Buchungsdauer (int, optional, überschreibt diese des Bereichs falls gesetzt)
- Blockiert Arbeitsplätze (Liste von IDs, `blocksWorkplaceIds`)
- Blockiert Arbeitsplätze via Tag (Liste von Tags, `blocksWorkplacesWithTag`, Arbeitsplätze mit diesen Tags werden
  blockiert)
- Liste von Tags (`tags`, z.B. "lärmig")
- Reihenfolge (int)

Markdown-Felder werden beim Rendern auf eine sichere Teilmenge beschränkt: kein HTML, keine Scripts, keine externen
Bilder.

Tags werden ohne führendes `#` gespeichert, sind freier Text und werden case-insensitiv verglichen.

Defekte Arbeitsplätze werden angezeigt, sind aber nicht buchbar (`status` = DEFECT).

Deaktivierte Arbeitsplätze (`status` = DISABLED) sind nicht buchbar und werden nur angezeigt, wenn die Benutzerrolle
"Arbeitsplätze ändern" darf ("manageWorkplaces").

DEFECT und DISABLED verhindern nur neue Buchungen. Bestehende Buchungen bleiben gültig und blockieren weiterhin.

Ein Arbeitsplatz kann nur gelöscht werden, wenn keine Buchung mit Endzeit in der Zukunft auf ihn verweist. Beim Löschen
wird er aus den `blocksWorkplaceIds` aller anderen Arbeitsplätze entfernt.

### Bereich

- ID
- Name (string)
- Farbe (string)
- Maximale Buchungsdauer (Minuten, integer)
- Maximale Buchung in der Zukunft (Tage, `maxBookingEndOffsetDays`, optional, überschreibt den globalen Wert)
- Erlaube Buchungen über Nacht (boolean, `allowNightlyActivities`) — Buchungen dürfen die Nacht überspannen. Start und
  Ende liegen weiterhin innerhalb der Öffnungszeiten.
- Reihenfolge (int)

Ein Bereich kann nur gelöscht werden, wenn ihm keine Arbeitsplätze zugeordnet sind.

### Buchung

- ID
- Benutzerrolle des Erstellers (Referenz auf Rollen-ID)
- IP-Adresse des Erstellers (nur mit `manageRoles` sichtbar, wird nach 90 Tagen gelöscht)
- Zeitpunkt des Erstellens
- Referenz auf Arbeitsplatz (string, `workplaceId`)
- Blockiert ebenfalls (Liste von Arbeitsplatz-IDs, `blockedWorkplaceIds`)
- Name (string, als Cookie gespeichert)
- Kontakt (string, als Cookie gespeichert)
- Nutzungsregeln bestätigt (boolean)
- Starttag/zeit (DateTime)
- Endtag/zeit (DateTime)
- Serien-ID (optional, falls teil einer Serienbuchung)

#### Blockierungen

`blockedWorkplaceIds` wird beim Erstellen und Ändern einer Buchung vom Backend berechnet und auf der Buchung gespeichert
(Snapshot): die Vereinigung von

- `blocksWorkplaceIds` des Arbeitsplatzes und
- allen Arbeitsplätzen, die zu diesem Zeitpunkt einen Tag aus `blocksWorkplacesWithTag` des Arbeitsplatzes tragen.

Der eigene Arbeitsplatz ist nicht Teil der Liste. Das Feld wird nie vom Client geliefert — sonst könnte jeder beliebige
Arbeitsplätze blockieren.

Daraus folgt:

- Blockierungen sind nicht transitiv (A blockiert B, B blockiert C -> A blockiert nicht implizit auch C)
- Änderungen an Blockierungen und Tags haben keinen Einfluss auf bestehende Buchungen. "Keine Kollision" bleibt damit
  eine dauerhafte Zusage.
- Ein neu angelegter Arbeitsplatz mit passendem Tag wird von bereits bestehenden Buchungen nicht blockiert

#### Kollision

Eine neue Buchung darf nicht mit einer bestehenden Buchung überlappen. Eine Kollision liegt vor, wenn sich die Zeiträume
überschneiden UND mindestens eine der folgenden Bedingungen gilt:

- `neu.workplaceId` ist gleich `bestehend.workplaceId`
- `neu.workplaceId` ist in `bestehend.blockedWorkplaceIds` enthalten
- `bestehend.workplaceId` ist in `neu.blockedWorkplaceIds` enthalten

Die Tag-Regeln tauchen hier nicht mehr auf: sie sind beim Erstellen der jeweiligen Buchung bereits in deren
`blockedWorkplaceIds` aufgelöst worden.

Zeiträume werden halboffen verglichen (`[start, ende)`): 10:00–11:00 kollidiert nicht mit 11:00–12:00.

Zwei Buchungen, die denselben dritten Arbeitsplatz blockieren, kollidieren *nicht* miteinander — blockiert ist nur der
dritte.

Beim Ändern einer Buchung wird diese selbst von der Prüfung ausgenommen.

Kollisionsprüfung und Speichern laufen in einer Transaktion, mit Sperre auf den betroffenen Arbeitsplätzen, damit zwei
gleichzeitige Anfragen nicht beide durchkommen.

#### Zeitregeln

Buchungen können viertelstündlich genau gebucht werden und allenfalls auch über mehrere Tage (vgl. maximale
Buchungsdauer). Start und Ende liegen auf dem 15-Minuten-Raster, die Dauer beträgt mindestens 15 Minuten.

Gebucht wird über Start- und Endzeitpunkt. Die anrechenbare Dauer wird daraus abgeleitet und dient nur der Validierung
gegen die maximale Buchungsdauer.

Falls `allowNightlyActivities` = true, Buchungen können länger als die öffnungszeiten (8 bis 21 uhr) dauern und gelten
dann als "über nacht". Die Nachtstunden werden für die Buchungsdauerbeschränkung nicht eingerechnet. Angerechnet wird
also nur die Zeit innerhalb der Öffnungszeiten; eine Buchung von Freitag 20:00 bis Samstag 09:00 zählt als 2 Stunden.

Weiter gilt:

- Die maximale Buchungsdauer ist die des Arbeitsplatzes, falls gesetzt, sonst die des Bereichs.
- Erlaubte Dauern im Dropdown (abgeschnitten beim Maximum, das Maximum selbst ist immer wählbar): 15, 30, 45 Minuten, 1,
  1.5, 2, 3, 4, 6, 8, 12, 24 Stunden, danach in Schritten von 24 Stunden.
- Ohne `allowNightlyActivities` müssen Start und Ende am selben Tag liegen.
- Start und Ende müssen innerhalb der Öffnungszeiten liegen, auch bei Bereichen mit `allowNightlyActivities`.
- Das Ende darf höchstens `maxBookingEndOffsetDays` Tage in der Zukunft liegen (Bereich, sonst globaler Wert).
- Beim Anlegen darf die Startzeit nicht in der Vergangenheit liegen. Beim Ändern schon: eine bereits laufende Buchung
  soll sich weiterhin anpassen lassen, und ihr Beginn liegt naturgemäss zurück.
- Buchungen, deren Endzeit in der Vergangenheit liegt, können nicht mehr geändert oder gelöscht werden.
- `noTimeRestrictions` hebt die maximale Buchungsdauer und `maxBookingEndOffsetDays` auf — nicht aber die
  Öffnungszeiten, nicht das 15-Minuten-Raster und nicht das Verbot, neu in der Vergangenheit zu buchen.

Zeiten werden als UTC gespeichert und in schweizer Zeit angezeigt (globale konfigurationsoption). Alle Datums- und
Zeitangaben in der API sind UTC mit explizitem `Z`.

### Buchungsserie

Nur mit `manageBookingSeries`.

- Serien-ID
- Referenz auf Arbeitsplatz (`workplaceId`)
- Name + Kontakt (werden auf jede Instanz kopiert)
- Interval (WEEKLY, MONTHLY)
- Interval-Anzahl (int, z.B. alle 2 Wochen)
- Startzeit + Datum der ersten Instanz (Datetime)
- Endzeit + Datum der ersten Instanz (Datetime)
- Endtag (Date, optional)
- Instanziert bis (Date)

Start- und Endzeit gelten als lokale Tageszeit, nicht als UTC — eine wöchentliche Serie um 09:00 bleibt über die
Zeitumstellung hinweg bei 09:00 Ortszeit.

MONTHLY bedeutet gleicher Tag im Monat. Monate ohne diesen Tag (z.B. der 31. im Februar) werden übersprungen.

Beim Erzeugen einer Buchungsserie werden alle Instanzen als "Buchung"en generiert bis zu 1 Jahr im Voraus, was im
"Instanziert Bis"-Feld gespeichert wird. Falls bereits existierende Buchungen mit der neuen Serie kollidieren, wird dies
als Warnung angezeigt, die serie trotzdem erstellt, und die kollidierenden Instanzen ausgelassen.

Serien-Instanzen unterliegen nicht `maxBookingEndOffsetDays`, sonst liessen sie sich nicht ein Jahr im Voraus anlegen.

1-mal täglich werden alle Buchungsserien überprüft und alle Instanzen erstellt, die zwischen "Instanziert Bis" und
"Heute + 1 Jahr" liegen. Danach wird "Instanziert bis" aktualisiert auf "Heute + 1 Jahr". Der Lauf ist idempotent und
gegen Mehrfachausführung gesichert.

Beim Ändern einer Serie werden die künftigen Instanzen abgeglichen statt gelöscht und neu erzeugt: Termine, die es
weiterhin gibt, werden an Ort und Stelle aktualisiert und behalten ihre ID, weggefallene verschwinden, neue kommen
dazu. Vergangene und laufende Instanzen bleiben unverändert.

Wer eine einzelne Instanz von Hand ändert, koppelt sie damit von der Serie ab. Abgekoppelte Instanzen bleiben beim
Ändern der Serie stehen, und der Takt-Zeitpunkt, an dem sie einmal lag, wird nicht neu befüllt. Dasselbe gilt für eine
einzeln gelöschte Instanz: der gestrichene Termin kehrt nicht zurück.

Beim Löschen einer Serie werden alle Instanzen mit Startzeit in der Zukunft gelöscht, auch abgekoppelte; vergangene
bleiben als eigenständige Buchungen bestehen.

### Globale Konfigurationswerte

Nur mit `manageRoles` änderbar, für alle lesbar (das Frontend braucht sie zum Rendern).

- Öffnungszeiten (zB 8 bis 21 Uhr), für alle Wochentage gültig
- Maximale Buchung in der Zukunft (Tage, `maxBookingEndOffsetDays`)
- Zeitzone (Default `Europe/Zurich`)

Das Zeitraster ist fix 15 Minuten und nicht konfigurierbar.

## Integrationen

- Auf Website als Liste der Termine
  (vgl. https://reservation.quartierwerkstatt-viktoria.ch/coming_up.php?room=%25Kurs%25&max=50)
- Begrüssungs-Tablet (Kartenansicht)
- UG-Tablet (Bereichsansicht)
- .ical-Abo (Modell-Referenz folgt, wird zuletzt umgesetzt)

## Use Cases

- Buchen im Voraus
- Vor Ort am tablet
- Per QR-Code und smartphone
