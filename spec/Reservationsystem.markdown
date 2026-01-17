# Reservationssystem

## Stack

- Angular 21 mit signal
- SCSS
- Backend: PHP with laravel
- Persistence: MySQL
- Validierung im Backend
- OpenAPI für API-Spec



## Ansichten

### Übersichtskarte mit Jetzt-Belegung
- basierend auf .svg mit tags (z.B. id="workplace-42")
- Farbige Markierung der Arbeitsplätze (frei/belegt/defekt/deaktiviert)
- Hover auf Arbeitsplatz zeigt Details an und link zum Buchen (sofern berechtigt)
- Auto-Refresh alle 60 Sekunden

### Kalenderansicht "Alle Arbeitsplätze"
- Zeigt alle Arbeitsplätze in der ersten Spalte (fixierte Spalte)
- Die Arbeitsplätze sind gruppiert nach Bereichen
- Oben gibt es eine Schnellwahl für "Heute", "Morgen", "Ganze Woche", "Ganzer Monat"
- Die weiteren Spalten zeigen die Zeit in bspw. 15-Minuten-Intervallen (horizontal scrollbar)
- Je nach Zeitbereich gibt es mehr oder weniger Spalten (z.B. bei "Ganze Woche" evtl. nur 1-Stunden-Intervalle)
- Die Zeitachse kann vor- und zurückgescrollt werden (Pfeile links/rechts)
- Buchungen als farbige Blöcke
- Blockierungen durch andere Buchungen werden als graue Blöcke angezeigt
- Die Blöcke zeigen Name + Kontakt des Buchenden an (sofern berechtigt)
- Hover auf Block zeigt Details an und link zum Bearbeiten (Bleistift-Icon) (sofern berechtigt)

### Kalenderansicht "Einzelner Arbeitsplatz"
- Zeigt einen Kalender für einen einzelnen Arbeitsplatz
- Oben Auswahl des Arbeitsplatzes (Dropdown)
- Erste Spalte: Datum
- Weitere Spalten: Zeit in 15-Minuten-Intervallen (horizontal scrollbar)
- Zeilen: Tage

### Admin-Ansichten
Jeder Aufzählungspunkt ist eine eigene Seite.

- Rollenübersicht
- Rolle bearbeiten
- Bereichsübersicht
- Bereich bearbeiten
- Arbeitsplatzübersicht (gruppiert nach Bereichen)
- Arbeitsplatz bearbeiten
- Serienbuchung (für Admins) (erst später implementieren)
  - csv-import
  - Kalender


## Modelle

### Benutzerrollen

Es gibt nur "Benutzerrollen", die von mehreren Benutzern verwendet werden, keine "Benutzer". Beispiele: "Mitglied" / "Admin" / "Anonym". Die Buchungen beinhalten Name + Kontakt, womit der tatsächliche Benutzer kontaktiert werden kann.

Anonyme Benutzer erhalten die Rolle "Anonym", bis sie sich einloggen.

- Name (string)
- Kennwort (gespeichert mit Salt und gehasht)
- Berechtigungen:
  - Buchungen ohne Name + Kontakt anzeigen (boolean, `viewBookings`)
  - Buchungen mit Name + Kontakt anzeigen (boolean, `viewBookingsDetails`)
  - Buchungen ändern (boolean, `manageBookings`) (egal von welchem anderen Benutzer, es gibt ja nur "Benutzerrollen")
  - Arbeitsplätze ändern (boolean, `manageWorkplaces`)
  - Bereiche ändern (boolean, `manageAreas`)
  - Benutzerrolen ändern (boolean, `manageRoles`)
  - ...

### Arbeitsplatz

- ID (string)
- Name (string)
- Beschrieb (string)
- Status (string, Enum: "OK", "DEFECT", "DISABLED")
- Ort (string, "Raum 3")
- Referenz auf Bereich (string, areaId)
- Link auf Wiki (string, format: uri)
- Maximale Buchungsdauer (int, optional, überschreibt diese des Bereichs falls gesetzt)
- Blockiert Arbeitsplätze (Liste von IDs, `blocksWorkplaceIds`)
- Blockiert Arbeitsplätze via Tag (Liste von Tags, `blocksWorkplacesWithTag`, Arbeitsplätze mit diesen Tags werden blockiert)
- Liste von Tags (`tags`, z.B. "#lärmig")
- Reihenfolge (int)

Defekte Arbeitsplätze werden angezeigt, sind aber nicht buchbar (`status` = DEFECT).

Deaktivierte Arbeitsplätze (`status` = DISABLED) sind nicht buchbar und werden nur angezeigt, wenn die Benutzerrolle "Arbeitsplätze ändern" darf ("manageWorkplaces").



### Bereich

- ID
- Name (string)
- Farbe (string)
- Maximale Buchungsdauer (Minuten, integer)
- Maximale Buchung in der Zukunft (Tage, `maxBookingEndOffsetDays`)
- Reihenfolge (int)



### Buchung

- ID
- Benutzerrolle des Erstellers
- Referenz auf Arbeitsplatz (string)
- Blockiert ebenfalls (Liste von Arbeitsplatz-IDs, `blocksWorkplaceIds`)
- Name (string, als Cookie gespeichert)
- Kontakt (string, als Cookie gespeichert)
- Starttag/zeit (DateTime)
- Endtag/zeit (DateTime)
- Serien-ID (optional, falls teil einer Serienbuchung)

Eine neue Buchung darf nicht mit einer bestehenden Buchung überlappen. D.h., eine Kollision liegt vor, wenn eine existierende Buchung im selben Zeitfenster liegt UND:

- sie denselben Arbeitsplatz (`workplaceId`) hat wie die neue Buchung
- ihr Arbeitsplatz in der Liste `blocksWorkplaceIds` der neuen Buchung steht
- ihr Arbeitsplatz einen Tag besitzt, der in der Liste `blocksWorkplacesWithTag` der neuen Buchung steht
- der Arbeitsplatz der neuen Buchung in der Liste `blocksWorkplaceIds` der existierenden Buchung steht
- der Arbeitsplatz der neuen Buchung einen Tag besitzt, der in der Liste `blocksWorkplacesWithTag` der existierenden Buchung steht

Ausserdem:

- Blockierungen sind nicht transitiv (A blockiert B, B blockiert C -> A blockiert nicht implizit auch C)
- Änderung der Blockierungen haben keinen Einfluss auf bestehende Buchungen
- Tags werden dynamisch (beim Erstellen oder Ändern einer Buchung) ausgewertet, um Kollisionen zu erkennen

Buchungen können viertelstündlich genau gebucht werden und allenfals auch über mehrere Tage (vgl. maximale Buchungsdauer).

Zeiten werden als UTC gespeichert und in schweizer Zeit angezeigt (globale konfigurationsoption)



### Buchungsserie

- Serien-ID
- Interval (DAILY, WEEKLY, MONTHLY)
- Interval-Anzahl (int, z.B. alle 2 Wochen)
- Startzeit + Datum der ersten Instanz (Datetime)
- Endzeit + Datum der ersten Instanz (Datetime)
- Endtag (Date, optional)
- Instanziert bis (Date)

Beim Erzeugen einer Buchungsserie werden alle Instanzen als "Buchung"en generiert bis zu 1 Jahr im Voraus, was im "Instanziert Bis"-Feld gespeichert wird. Falls bereits existierende Buchungen mit der neuen Serie kollidieren, wird dies als Warnung angezeigt, die serie trotzdem erstellt, und die kollidierenden Instanzen ausgelassen.

1-mal monatlich werden alle Buchungsserien überprüft und alle Instanzen erstellt, die zwischen "Instanziert Bis" und "Heute + 1 Jahr" liegen. Danach wird "Instanziert bis" aktualisiert auf "Heute + 1 Jahr"

## Integrationen

- Auf Website als Liste der Termine (vgl. https://reservation.quartierwerkstatt-viktoria.ch/coming_up.php?room=%25Kurs%25&max=50)
- Begrüssungs-Tablet (Kartenansicht)
- UG-Tablet (Bereichsansicht)
- .ical-Abo?



## Use Cases

- Buchen im Voraus
- Vor Ort am tablet
- Per QR-Code und smartphone
