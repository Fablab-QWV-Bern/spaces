# Reservationssystem

## Stack

- Angular 21 mit signal
- SCSS
- Backend: PHP with laravel
- Persistence: MySQL
- Validierung im Backend
- OpenAPI für API-Spec



## Ansichten

- Übersichtskarte mit Jetzt-Belegung (basierend auf .svg)
- Alle Arbeitsplätze "Heute"
  - Bereiche mit Farbe + Buchungsbeschränkungen
  - Bereichs-Ansichten
- Rollen (Benutzer, Admin)
- Resourcenliste
  - Bearbeiten
- Serienbuchung (für Admins)
  - csv-import
  - Kalender



## Modelle

### Benutzerrollen

Es gibt nur "Benutzerrollen", die von mehreren Benutzern verwendet werden, keine "Benutzer". Beispiele: "Mitglied" / "Admin" / "Anonym". Die Buchungen beinhalten Name + Kontakt, womit der tatsächliche Benutzer kontaktiert werden kann.

Anonyme Benutzer erhalten die Rolle "Anonym", bis sie sich einloggen.

- Name (string)
- Kennwort (gespeichert mit Salt und gehasht)
- Berechtigungen:
  - Buchungen ohne Name + Kontakt anzeigen (boolean)
  - Buchungen mit Name + Kontakt anzeigen (boolean)
  - Buchungen ändern (boolean) (egal von welchem anderen Benutzer, es gibt ja nur "Benutzerrollen")
  - Arbeitsplätze ändern (boolean)
  - Bereiche ändern (boolean)
  - Benutzerrolen ändern (boolean)
  - ...

### Arbeitsplatz

- ID (string)
- Name (string)
- Beschrieb (string)
- Status (string, "Defekt", "OK", "Deaktiviert")
- Ort (string, "Raum 3")
- Referenz auf Bereich (string)
- Link auf Wiki (string)
- Maximale Buchungsdauer (optional, überschreibt diese des Bereichs falls gesetzt)
- Blockiert ebenfalls (Referenzen auf andere Arbeitsplätze oder Tags, string[])
- Liste von tags (string[], "#lärmig")
- Reihenfolge (int)

Defekte Arbeitsplätze werden angezeigt, sind aber nicht buchbar

Deaktivierte Arbeitsplätze sind nicht buchbar und werden nur angezeigt, wenn die Benutzerrolle "Arbeitsplätze ändern" darf



### Bereich

- ID
- Name (string)
- Farbe (string)
- Maximale Buchungsdauer (erforderlich)
- Maximale Buchung in der Zukunft (bezogen auf Endzeitpunkt einer Buchung)
- Reihenfolge (int)



### Buchung

- ID
- Benutzerrolle des Erstellers
- Referenz auf Arbeitsplatz (string)
- Name (string, als Cookie gespeichert)
- Kontakt (string, als Cookie gespeichert)
- Starttag/zeit
- Endtag/zeit
- Serien-ID (optional, falls teil einer Serienbuchung)

Eine neue Buchung darf nicht mit einer bestehenden Buchung überlappen. Dh, eine existierende Buchung im selben Zeitfenster hat:

- denselben Arbeitsplatz wie die neue Buchung
- einen Arbeitsplatz, der unter "Blockiert ebenfalls" den Arbeitsplatz der neue Buchung referenziert
- einen Arbeitsplatz, der beim Arbeitsplatz der neuen Buchung als "Blockiert ebenfalls" geführt wird
- "Blockiert ebenfalls" darf neben Arbeitsplatz-IDs auch Tags beinhalten

Ausserdem:

- Blockierungen sind nicht transitiv (A blockiert B, B blockiert C -> A blockiert nicht implizit auch C)
- Änderung der Blockierungen haben keinen Einfluss auf bestehende Buchungen
- Tags werden erst beim Erstellen einer neuen Buchung aufgelöst auf eine Liste von Arbeitsplätzen, die diesen Tag tragen, um Kollisionen zu erkennen

Buchungen können viertelstündlich genau gebucht werden und allenfals auch über mehrere Tage (vgl. maximale Buchungsdauer).

Zeiten werden als UTC gespeichert und in schweizer Zeit angezeigt (globale konfigurationsoption)



### Buchungsserie

- Serien-ID
- Interval (n-wöchtentlich / n-monatlich)
- Starttag 
- Endtag (optional)
- Instanziert bis (Tag)

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

