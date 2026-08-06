# MVX Investor Portal

Schlanke Version: sicherer Login über Supabase Auth, der Owner kann
Konten anlegen und Investoren Anteile vergeben. Investoren sehen nach
dem Login nur ihre eigene Anteilszahl. Design angelehnt an MVX Esports
(monochrom, Glas-Effekte, Ethnocentric-Schrift).

## 1. Supabase einrichten

1. In deinem Supabase-Projekt: **SQL Editor** → Inhalt von `supabase/schema.sql`
   einfügen → **Run**. Das legt die `profiles`-Tabelle, Sicherheitsregeln
   (RLS), Hilfsfunktionen sowie die Tabellen für Neuigkeiten, Dokumente und
   das Aktivitätsprotokoll an. Das Skript ist idempotent – wenn du es auf
   einem bereits laufenden Projekt erneut ausführst, wird nichts doppelt
   angelegt oder überschrieben, was nicht überschrieben werden soll.
1b. **Storage-Bucket für Dokumente anlegen** (einmalig, manuell): Dashboard
    → **Storage** → **New bucket** → Name genau `documents` → **Public**
    AUS lassen. Die Zugriffsregeln dafür stehen bereits im Schema (nur der
    Owner darf hochladen/löschen, alle eingeloggten Personen dürfen über
    signierte Links herunterladen).
2. **Authentication → Add user** → ersten Owner-Account anlegen (E-Mail +
   Passwort, "Auto Confirm User" aktivieren).
3. Im SQL Editor (E-Mail anpassen):
   ```sql
   update public.profiles
   set role = 'owner', first_login = false, full_name = 'MVX Owner'
   where email = 'owner@deine-domain.de';
   ```
4. Edge Function deployen (benötigt die [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref DEIN-PROJEKT-REF
   supabase functions deploy create-investor
   supabase functions deploy send-poll-notification
   ```
   Die Function nutzt automatisch die Secrets `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY`, die Supabase
   Functions bereits automatisch bereitstellt – du musst nichts manuell
   setzen.

5. **Push-Benachrichtigungen einrichten** (für die Dringlichkeits-Alarme
   bei Abstimmungen):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Das erzeugt ein Public/Private-Schlüsselpaar. Dann:
   - `VITE_VAPID_PUBLIC_KEY` = der Public Key → in deine `.env` **und**
     im Cloudflare-Projekt als Build-Variable eintragen.
   - Die drei folgenden Werte als Supabase Secrets setzen (Private Key
     bleibt geheim, landet nie im Frontend):
     ```bash
     supabase secrets set VAPID_PUBLIC_KEY=DEIN_PUBLIC_KEY
     supabase secrets set VAPID_PRIVATE_KEY=DEIN_PRIVATE_KEY
     supabase secrets set VAPID_SUBJECT=mailto:owner@deine-domain.de
     ```
   - Jede Person muss einmal in **Profil → Push-Benachrichtigungen
     aktivieren** tippen. **Wichtig auf dem iPhone:** Push funktioniert
     nur, wenn die Seite vorher über „Zum Home-Bildschirm hinzufügen“
     installiert und von dort geöffnet wurde (siehe unten) – in Safari
     im normalen Browser-Tab liefert iOS keine Push-Nachrichten aus.

## 2. Projekt lokal einrichten

```bash
cp .env.example .env
# .env öffnen und VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eintragen
npm install
npm run dev
```

## 3. Deployment (z.B. Vercel/Netlify)

Als Vite-Projekt verbinden, Build-Command `npm run build`, Output-Ordner
`dist`. Die beiden Umgebungsvariablen `VITE_SUPABASE_URL` und
`VITE_SUPABASE_ANON_KEY` im Hosting-Dashboard setzen (gleiche Werte wie
in deiner `.env`).

## Funktionsumfang

- **Login** (`/login`): E-Mail + Passwort über Supabase Auth. Beim
  ersten Login wird ein eigenes Passwort erzwungen (`/passwort-aendern`).
- **Investor-Ansicht** (`/`): zeigt ausschließlich die eigene Anteilszahl.
- **Owner Panel** (`/owner`, nur für Owner sichtbar):
  - Neues Konto anlegen (Name, E-Mail, Start-Anteile) → läuft über die
    Edge Function `create-investor`, die serverseitig mit dem geheimen
    service_role Key arbeitet (nie im Browser sichtbar) und ein
    temporäres Passwort generiert.
  - Liste aller Investoren mit aktueller Anteilszahl, plus Feld um
    Anteile hinzuzufügen (atomar über die Datenbankfunktion
    `owner_add_shares`, damit nichts verloren geht bei gleichzeitigen
    Änderungen).
- **Row Level Security** auf der `profiles`-Tabelle: Investoren sehen
  nur ihre eigene Zeile, der Owner sieht und verwaltet alle. Ein
  Investor kann sich selbst weder Anteile noch die Owner-Rolle geben –
  das erzwingt die Datenbank, nicht nur das Frontend.
- Als **installierbare PWA** vorbereitet (siehe unten).
- **Dringlichkeitsstufen** bei Abstimmungen: Normal (weißer Rand,
  normale Benachrichtigung), Dringend (oranger Rand, hohe Relevanz)
  und Notfall (roter Rand, dringende Benachrichtigung mit Vibration).
- **Neuigkeiten** (`/news`): Owner kann Update-Beiträge veröffentlichen
  (optional angeheftet), alle sehen sie im Feed; die letzten zwei
  erscheinen zusätzlich als Vorschau auf dem Dashboard.
- **Dokumente** (`/dokumente`): Owner kann Dateien (Reports, Verträge)
  hochladen, alle Investoren können sie über zeitlich begrenzte, sichere
  Links herunterladen. Dateien liegen in einem privaten Supabase-Storage-
  Bucket, nicht öffentlich zugänglich.
- **Owner-Übersicht** im Owner Panel: Gesamtzahl Investoren, Anteile
  gesamt, Durchschnitt sowie eine Verteilungs-Grafik der größten
  Investoren.
- **Bulk-Aktionen**: mehrere Investoren im Owner Panel auswählen und
  auf einmal Anteile hinzufügen/entfernen.
- **Aktivitätsprotokoll**: für den Owner sichtbares Log aller wichtigen
  Aktionen (Konten angelegt, Anteile geändert, Abstimmungen erstellt/
  geschlossen, Neuigkeiten und Dokumente veröffentlicht/gelöscht).

## Auf dem iPhone als App nutzen

### Weg A – Als "Web-App" installieren (schnell, kostenlos, kein App Store)

Diese App ist bereits als **PWA (Progressive Web App)** konfiguriert
(`manifest.webmanifest`, Apple-Meta-Tags, Icon). Sobald sie unter einer
echten HTTPS-Domain läuft (z.B. über Vercel):

1. Seite in **Safari** auf dem iPhone öffnen (muss Safari sein, nicht Chrome).
2. Teilen-Symbol antippen → **"Zum Home-Bildschirm"**.
3. Fertig – App-Icon liegt auf dem Homescreen, startet im Vollbild ohne
   Browserleiste, funktioniert wie eine normale App.

### Weg B – Echte native App / App Store (mehr Aufwand)

Mit **[Capacitor](https://capacitorjs.com/)** (von den Ionic-Machern)
packst du genau dieses React-Projekt in eine echte iOS-App:

```bash
npm install @capacitor/core @capacitor/ios
npx cap init "MVX Investor Portal" "de.mvx.investor"
npm run build
npx cap add ios
npx cap open ios
```

Das öffnet Xcode – von dort kannst du auf einem echten iPhone testen und
später im App Store veröffentlichen (dafür brauchst du einen kostenpflichtigen
Apple Developer Account, 99 $/Jahr, sowie einen Mac mit Xcode).

**Empfehlung:** Für ein internes Investoren-Tool reicht Weg A
(PWA/Home-Bildschirm) meistens völlig aus. Weg B lohnt sich erst, wenn
die App öffentlich im App Store auffindbar sein soll.
