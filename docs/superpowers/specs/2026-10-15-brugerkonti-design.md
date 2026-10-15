# Brugerkonti i stedet for fælles adgangskode

Dato: 2026-10-15 · Status: til gennemgang

## Formål

Flere personer skal hver kunne oprette deres egen konto og logge ind på den. Hver bruger ser og redigerer kun sine egne skabeloner. Den fælles adgangskode (`STITCHBOARD_PASSWORD`) udgår.

## Beslutninger

- **Tilmelding kræver invitationskode** – én fælles kode i miljøvariablen `INVITE_CODE`. Slipper den ud, skiftes den i Netlify-dashboardet. Eksisterende konti påvirkes ikke af et skift.
- **Login med brugernavn + adgangskode** – ingen e-mail.
- **Ingen selvbetjent nulstilling** – Jens nulstiller manuelt med et script (se nedenfor).
- **Ingen deling** mellem konti.
- **Eksisterende skabeloner flyttes automatisk** til kontoen i `OWNER_USERNAME`, første gang den logger ind.
- **Fortsat Netlify Functions + Blobs**, ingen ekstern login-tjeneste og ingen nye afhængigheder (hashing med `node:crypto` scrypt).

Fravalgt: ekstern auth (Auth0/Clerk/Supabase – overkill og ny tredjepart), Netlify Identity (udfaset), personlige engangs-invitationer og mail-nulstilling (kan bygges ovenpå senere).

## Arkitektur

```
Browser (React)  ──fetch──▶  /api/*  ──▶  Blobs store "users"     nøgle = brugernavn (små bogstaver)
                  cookie     (session      Blobs store "projects"  nøgle = <bruger>/<projekt-id>
                             m. bruger)
```

### Data

**Store `users`**, nøgle = brugernavn med små bogstaver:

```json
{ "username": "Jens", "salt": "<hex>", "hash": "<scrypt hex>", "createdAt": 1760000000000 }
```

- `username` gemmer brugerens egen stavemåde til visning.
- Brugernavn: `^[A-Za-z0-9_-]{3,32}$`, store/små bogstaver ses som ens.
- Adgangskode: 8–200 tegn (øvre grænse så scrypt ikke kan misbruges med kæmpe input).
- Hash: `scrypt(password, salt, 64)` med 16 bytes tilfældigt salt og Nodes standardparametre. Sammenligning med `timingSafeEqual`.
- Oprettelse skrives med `onlyIfNew: true`, så to samtidige tilmeldinger med samme navn ikke overskriver hinanden – den der taber får 409.

**Store `projects`**, nøgle = `<bruger>/<projekt-id>` (bruger = små bogstaver). `list` bruger `prefix: '<bruger>/'` og returnerer id'er uden præfiks. Projekt-JSON ændres ikke.

### Session-cookie

`sb_session=<bruger>.<udløb>.<hmac>` hvor `hmac = HMAC-SHA256(SESSION_SECRET, "<bruger>.<udløb>")`. Brugernavnet kan ikke indeholde `.`, så formatet er entydigt. Samme flag og levetid som i dag (`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1 år`). `verifySession` returnerer brugernavnet eller `null`. Den gamle cookie uden brugernavn afvises, så alle logges ud én gang ved deploy.

### API (`netlify/functions/lib/handler.mjs`)

| Metode & sti | Krop | Svar |
| --- | --- | --- |
| `POST /api/register` | `{ username, password, inviteCode }` | 204 + cookie · 400 ugyldigt brugernavn/adgangskode · 403 forkert invitationskode · 409 brugernavn optaget |
| `POST /api/login` | `{ username, password }` | 204 + cookie · 401 forkert brugernavn eller adgangskode |
| `POST /api/logout` | – | 204, cookie ryddes |
| `GET /api/me` | – | 200 `{ username }` |
| `GET/PUT/DELETE /api/projects…` | som i dag | som i dag, men kun inden for brugerens præfiks |

- Alle ruter undtagen `register` og `login` kræver gyldig session, ellers 401.
- `register` tjekker invitationskoden (konstant tid) **før** brugernavnet slås op, så man ikke kan undersøge, hvilke navne der findes, uden koden.
- `login` giver samme svar ved ukendt bruger og forkert kode. Ved ukendt bruger hashes der alligevel mod et dummy-salt, så svartiden ikke afslører, om brugeren findes.
- Projekt-ruterne bygger nøglen som `${bruger}/${id}`; `id` valideres som i dag (`ID_RE`, ingen `/`), så man ikke kan ramme et andet præfiks.
- Ren logik (hashing, cookie, validering, routing, migrering) i `netlify/functions/lib/` som rene funktioner. `api.mjs` injicerer to stores: `users` (`get`, `create` med onlyIfNew → returnerer om det lykkedes, `set`) og `projects` (`get`, `set`, `delete`, `list(prefix)`).

**Miljøvariabler:** `SESSION_SECRET` og `INVITE_CODE` påkrævet (mangler en → 500 + log-besked). `OWNER_USERNAME` valgfri.

### Migrering af ejerløse skabeloner

Ved vellykket `login` eller `register` hvor brugeren er `OWNER_USERNAME` (små bogstaver): list alle nøgler i `projects` uden `/`, og for hver: læs, skriv til `<owner>/<id>`, slet den gamle. Skrivning før sletning, så et afbrudt forløb ikke mister noget. Findes `<owner>/<id>` allerede (fra et afbrudt forløb), overskrives den ikke – den kan være redigeret siden – og kun den gamle nøgle slettes. Når der ikke er ejerløse nøgler, koster det én `list`.

### Nulstilling af adgangskode

`scripts/reset-password.mjs <brugernavn> <ny-kode>` genbruger hash-funktionen fra `lib/` og udskriver en færdig kommando:

```bash
npx netlify-cli blobs:set users <bruger> '<json>'
```

Scriptet skriver ikke selv til Netlify – Jens kører kommandoen. Sletning af en bruger sker tilsvarende med `blobs:delete` (skabelonerne under præfikset skal slettes for sig).

### Klient

- **`src/api.js`:** `login(username, password)` → `true/false`; `register(username, password, inviteCode)` → `null` ved succes, ellers `'invalid' | 'invite' | 'taken'`; `fetchMe()` → `{ username }`. Øvrige funktioner uændrede.
- **`src/components/Login.jsx`:** to faner, "Log ind" og "Opret konto". Opret: brugernavn, adgangskode, gentag adgangskode, invitationskode. Klienten tjekker længder, tegn og at de to adgangskoder er ens, før der sendes. Fejltekster: "Forkert brugernavn eller adgangskode", "Brugernavnet er optaget", "Forkert invitationskode", "Kunne ikke kontakte serveren".
- **`App.jsx`:** henter `fetchMe()` sammen med projekterne og gemmer `username`. `Home` viser "Logget ind som X" ved "Log ud"-knappen.
- **Ventende ændringer og brugerskift:** `App` husker, hvilken bruger data på skærmen tilhører, og autogem holder pause efter en 401 (sender intet – heller ikke ved skjult fane – før `resume()`). Logger en *anden* bruger ind efter en 401, kasseres de ventende ændringer og den lokale projektliste, før den nye brugers projekter hentes. Samme bruger → sendes som i dag.
- **"Hent fra denne browser":** uændret. Flaget er pr. browser, så den første bruger der trykker, får de gamle localStorage-skabeloner.

## Fejlhåndtering – opsummering

| Situation | Adfærd |
| --- | --- |
| Forkert brugernavn/kode | 401 → "Forkert brugernavn eller adgangskode" |
| Forkert invitationskode | 403 → "Forkert invitationskode" |
| Brugernavn optaget | 409 → "Brugernavnet er optaget" |
| Ugyldigt input | Fanges i klienten; serveren svarer 400 som sikkerhedsnet |
| Gammel/ugyldig cookie | 401 → login-skærm |
| Manglende miljøvariabler | 500, log-besked |

## Kendte svagheder

- **Ingen rate limiting** på login/register – Blobs har ingen atomiske tællere. Acceptabelt med få inviterede brugere og minimumslængde, men gætteangreb bremses kun af scrypts pris.
- Fælles invitationskode kan deles videre, indtil den skiftes.
- Nulstilling og sletning af brugere er manuelt via Netlify CLI.

## Test (vitest)

- **`session.test.mjs`:** sign/verify med bruger; ændret bruger, ændret udløb, udløbet og gammelt format afvises.
- **`password` (ny testfil):** korrekt/forkert kode, forskelligt salt pr. hash.
- **`handler.test.mjs`:** register (gyldig, forkert invitation, optaget inkl. andre store/små bogstaver, ugyldigt input, 403 før opslag); login (korrekt, forkert kode, ukendt bruger); `/api/me`; isolation (A kan ikke liste/hente/overskrive/slette B's skabeloner); migrering (kun for owner, kun ejerløse nøgler, ingen ændring anden gang); manglende miljøvariabler.
- **`api.test.js`:** `register` mapper 400/403/409 korrekt; `login` ny krop.
- **`autosave.test.js`:** ventende ændringer kasseres ved brugerskift, bevares ved samme bruger.

## Dokumentation

README: `.env`-eksempel og Netlify-miljøvariabler (`SESSION_SECRET`, `INVITE_CODE`, `OWNER_USERNAME`), hvordan man inviterer, og nulstillings-scriptet. Teksten "bag en adgangskode" opdateres.
