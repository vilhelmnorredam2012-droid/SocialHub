# SocialHub fixed version

Denne version er lavet til Netlify + Supabase og indeholder:

- Email/adgangskode login via Supabase Auth
- Opret konto med brugernavn
- Automatisk profil-oprettelse via Supabase trigger
- Global chat
- Privat chat mellem brugere
- Online/offline status
- Realtime-opdateringer
- RLS policies, så brugere kun kan slette deres egne beskeder
- Ren `index.html` uden duplikerede HTML-dokumenter

## 1. Sæt Supabase op

1. Gå til Supabase.
2. Åbn dit projekt.
3. Gå til **SQL Editor**.
4. Opret en ny query.
5. Kopiér alt fra `supabase-setup.sql` ind.
6. Tryk **Run**.

Dette opretter tabellerne:

- `profiles`
- `global_messages`
- `private_messages`

## 2. Indsæt din Supabase config

Åbn `config.js` og erstat:

```js
SUPABASE_URL: "https://kglluoywbhirrewhyrrk.supabase.co",
SUPABASE_ANON_KEY: "PASTE_YOUR_REAL_SUPABASE_ANON_PUBLIC_KEY_HERE"
```

med dine egne værdier fra:

**Supabase → Project Settings → API**

Brug:

- **Project URL**
- **anon public key**

Vigtigt: Den anon key, der lå i den gamle ZIP, matchede ikke projekt-URL'en og virkede derfor ikke korrekt.

## 3. Auth settings

Hvis du vil have brugere direkte ind efter oprettelse:

1. Supabase → Authentication → Providers → Email
2. Slå **Confirm email** fra

Hvis email-confirmation er slået til, skal brugeren bekræfte sin email før login.

## 4. Netlify deployment

Upload hele mappen til GitHub eller drag-and-drop mappen til Netlify.

Netlify skal bruge:

- Build command: tom
- Publish directory: `.`

`netlify.toml` er allerede inkluderet.

## 5. Lokal test

Du kan teste lokalt ved at åbne `index.html`, men realtime/auth virker bedst via Netlify eller en lokal webserver.

Eksempel:

```bash
python3 -m http.server 5173
```

Åbn derefter:

```text
http://localhost:5173
```

## 6. Hvis noget stadig fejler

Tjek først disse tre ting:

1. Har du kørt `supabase-setup.sql`?
2. Har du indsat den rigtige `SUPABASE_URL` og `SUPABASE_ANON_KEY` i `config.js`?
3. Kommer URL og anon key fra samme Supabase-projekt?
