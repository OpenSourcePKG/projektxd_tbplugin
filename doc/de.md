<p align="center">
  <img src="../assets/chrome/content/images/projektxd.png" width="96" alt="projektXD Logo">
</p>

<h1 align="center">projektXD Add-on — Anleitung</h1>

Diese Seite führt Schritt für Schritt durch Installation und Konfiguration. Entwickler-Doku siehe [README](../README.md).

## 1. Add-on installieren

1. `built/projektXD-<version>.xpi` herunterladen (z. B. `projektXD-2.0.0.xpi`).
2. In Thunderbird **Einstellungen → Add-ons & Themes** öffnen.
3. Auf das Zahnrad-Symbol klicken → **Add-on aus Datei installieren…** und das `.xpi` auswählen.
4. Den Installations-Dialog bestätigen. Thunderbird weist darauf hin, dass das Add-on **„Zugriff auf Daten aller Websites"** benötigt — das ist nötig, weil jede projektXD-Instanz unter einer anderen Adresse läuft. Verwendet wird der Zugriff ausschließlich für deine konfigurierte projektXD-URL.

## 2. Verbindung konfigurieren

**Add-ons & Themes → projektXD → Einstellungen** öffnen (oder direkt nach der Installation: **Optionen**).

### Verbindung

| Feld | Bedeutung |
|---|---|
| **URL** | Vollständige Adresse zur projektXD-Instanz inklusive Pfad, z. B. `https://portal.example.com/projekte/`. Muss mit `http://` oder `https://` beginnen. Ungültige Eingaben lösen einen Fehler-Toast aus. |
| **Aktivieren** | Einmaliger Klick nach der Installation. Im darauffolgenden Berechtigungs-Dialog bestätigen — Thunderbird verlangt einen ausdrücklichen Nutzer-Klick, um den Host-Zugriff freizugeben. Das Status-Pill unter dem Feld wechselt von orange „Zugriff fehlt" auf grün „Zugriff erteilt". |

### Anmeldedaten

| Feld | Bedeutung |
|---|---|
| **Benutzer** | Dein projektXD-Loginname. |
| **Passwort** | Dein projektXD-Passwort. Der Augen-Button schaltet die Sichtbarkeit um. |
| **Automatisch anmelden** | Wenn aktiv, meldet dich das Add-on beim Klick auf das Toolbar-Icon automatisch an — sofern du nicht bereits eingeloggt bist. |

Jedes Feld speichert sich beim Verlassen automatisch. Rechts oben blinkt kurz ein „Gespeichert"-Pill als Bestätigung.

## 3. Nutzung

Klick auf das **projektXD-Icon** in der Thunderbird-Toolbar:

- Existiert bereits ein Tab mit der konfigurierten URL, wird er fokussiert.
- Ansonsten wird ein neuer Tab geöffnet.
- Ist *Automatisch anmelden* aktiv und du bist noch nicht eingeloggt, ruft das Add-on das projektXD-Backend zum Login auf und lädt den Tab neu, damit die SPA die etablierte Session übernimmt.

## Troubleshooting

**Der Login passiert nicht.**
Thunderbird-Fehlerkonsole öffnen (**Extras → Entwicklerwerkzeuge → Fehlerkonsole**, oder `Strg+Shift+J`) und nach Meldungen mit Prefix `projektXD::` suchen. Der Background protokolliert vor jedem Inject-Versuch die tatsächliche Tab-URL und die erteilten Berechtigungen:

```
projektXD: about to inject — tab.url=... granted={...}
```

Enthält `granted` weder `<all_urls>` noch deinen Origin, im Options-Dialog erneut auf **Aktivieren** klicken.

**Das Status-Pill bleibt orange, obwohl ich auf „Aktivieren" geklickt habe.**
Den Thunderbird-Berechtigungs-Prompt bestätigen. Falls du ihn verpasst hast, einfach noch einmal auf **Aktivieren** klicken — der Prompt erscheint nur direkt nach einem Nutzer-Klick.

**Ich habe das Add-on neu installiert und nichts funktioniert mehr.**
Beim Neuinstallieren werden zur Laufzeit erteilte Host-Permissions zurückgesetzt. Options-Dialog öffnen und noch einmal **Aktivieren** klicken.

**Die Toolbar öffnet einen Tab, aber ich bin nicht eingeloggt.**
Prüfen, ob *Automatisch anmelden* aktiv ist. Wenn ja, in der Fehlerkonsole nach `ProjektXDApi.login: success=...` schauen — bei `false` hat das Backend die Anmeldedaten abgelehnt.