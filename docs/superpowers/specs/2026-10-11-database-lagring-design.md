# Skabeloner i database i stedet for localStorage

Dato: 2026-10-11 · Status: til gennemgang

## Formål

Jens skal kunne se og redigere de samme skabeloner (inkl. strikke-fremdrift i `knit`) på alle sine enheder. Appen har kun én bruger.

## Beslutninger

- **Én bruger, fast adgangskode** – ingen konti. Adgangskoden ligger som miljøvariabel på Netlify.
- **Kun online** – databasen er eneste kilde til skabeloner. Ingen lokal cache eller offline-sync.
- **Eksisterende localStorage-data hentes med én knap** – findes der skabeloner i browseren (`stitchboard.projects.v1` / `strikkeskabelon.projects.v1`), viser forsiden "Hent N fra denne browser". De går gennem samme normalisering som fil-import (nyt id, kanter udledt for gamle filer) og gemmes på serveren. Bagefter sættes `stitchboard.localImported`, så knappen ikke vises igen. De gamle data slettes ikke. (Ændret efter review: eksport findes kun i editoren, så gamle skabeloner kunne ellers ikke nås.)
- **Lager: Netlify Blobs, én blob pr. skabelon** – ingen ekstern tjeneste. Konflikter løses med "sidst gemte vinder" pr. skabelon.

## Arkitektur

```
Browser (React)  ──fetch──▶  Netlify Function /api/*  ──▶  Netlify Blobs (store "projects")
                  cookie                (tjekker session)        nøgle = projekt-id, værdi = projekt-JSON
```

### Serverside: `netlify/functions/api.mjs`

Én funktion med `config.path = "/api/*"` der router på metode + sti.

| Metode & sti | Krop | Svar |
| --- | --- | --- |
| `POST /api/login` | `{ password }` | 204 + `Set-Cookie` ved korrekt kode, ellers 401 |
| `POST /api/logout` | – | 204, cookie ryddes |
| `GET /api/projects` | – | 200 `[id, …]` – kun id'er, så svaret holder sig under Netlifys grænse for svarstørrelse |
| `GET /api/projects/:id` | – | 200 projekt-JSON, eller 200 `null` hvis det ikke findes (ikke 404: så prøver Netlify `<sti>.html`) |
| `PUT /api/projects/:id` | projekt-JSON | 204. `id` i stien skal matche `id` i kroppen, ellers 400 |
| `DELETE /api/projects/:id` | – | 204 (også hvis den ikke fandtes) |

Alle ruter undtagen `login` kræver gyldig session, ellers 401. Ukendte ruter: 404.

**Session-cookie:** `sb_session=<udløb>.<hmac>` hvor `hmac = HMAC-SHA256(SESSION_SECRET, udløb)`. Flag: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000` (1 år). Verifikation sammenligner HMAC med konstant-tid-sammenligning og tjekker udløb. Adgangskoden sammenlignes også i konstant tid. At skifte `SESSION_SECRET` logger alle enheder ud.

**Miljøvariabler:** `STITCHBOARD_PASSWORD`, `SESSION_SECRET`. Mangler en af dem, svarer funktionen 500 med en tydelig fejltekst i loggen.

**Validering ved PUT:** kroppen skal være et objekt med streng-`id`, tal-`cols`/`rows` og array-`shape`. Ellers 400. Ingen dybere skemavalidering (YAGNI). Kropsgrænse: Netlifys standard.

Ren logik (cookie-signering/verifikation, routing, validering) placeres i `netlify/functions/lib/` som rene funktioner, så de kan testes uden Netlify-runtime. Blobs-adgang injiceres som et simpelt store-objekt (`get/set/delete/list`), så tests kan bruge et in-memory store.

### Klientside

**`src/api.js` (ny):** tynde fetch-wrappers – `login(password)`, `logout()`, `fetchProjects()`, `saveProject(p)`, `deleteProject(id)`. Kaster en `UnauthorizedError` ved 401 og en almindelig `Error` ved andre fejl. `saveProject` bruger `keepalive: true`, så flush ved `pagehide` når frem.

**`src/storage.js`:** `loadProjects`/`saveProjects`/migreringslogikken fjernes. `migrate` (kant-konvertering af ældre formater) flyttes til `importProject`-stien hvor den stadig er nødvendig for gamle `.strik.json`. `downloadJSON`/`readJSONFile` bliver.

**`src/components/Login.jsx` (ny):** simpel formular med adgangskodefelt + knap, fejltekst ved forkert kode. Samme visuelle stil som `Home`.

**`App.jsx`:**
- Tilstand: `status` = `'loading' | 'login' | 'ready' | 'error'`.
- Ved start: `fetchProjects()` → `ready`; `UnauthorizedError` → `login`; anden fejl → `error` med "Kunne ikke hente skabeloner" og en "Prøv igen"-knap.
- Efter login: hent projekter igen.
- **Autogem:** et `dirty`-sæt af projekt-id'er. `updateProject` markerer id'et dirty. 300 ms efter seneste ændring sendes hvert dirty projekt med `saveProject` og fjernes fra sættet ved succes. `pagehide`/`visibilitychange→hidden` flusher straks.
- `create`, `duplicate`, `importProject` gemmer det nye projekt straks. `remove` kalder `deleteProject`.
- **Fejl ved gem:** id'et forbliver dirty, en diskret statuslinje viser "Ikke gemt – prøver igen", og der prøves igen efter 5 sek. (og ved næste ændring). Ved 401 skiftes til login-skærmen; dirty-sættet bevares og sendes efter login.
- En "Log ud"-knap på forsiden kalder `logout()` og viser login-skærmen.

## Lokal udvikling

`netlify dev` (Netlify CLI, `npx netlify dev`) kører Vite + funktioner + lokalt Blobs-lager. Miljøvariablerne lægges i `.env` (som tilføjes `.gitignore`). README opdateres: kør-lokalt-afsnittet, og at miljøvariablerne skal sættes i Netlify-dashboardet før deploy. Teksten om at projekter gemmes i browseren opdateres.

Nye afhængigheder: `@netlify/blobs` (runtime), `vitest` (dev). Ny script: `"test": "vitest run"`.

## Fejlhåndtering – opsummering

| Situation | Adfærd |
| --- | --- |
| Ingen/ugyldig/udløbet cookie | 401 → login-skærm |
| Forkert adgangskode | "Forkert adgangskode" under feltet |
| Netværksfejl ved hentning | Fejlskærm med "Prøv igen" |
| Netværksfejl ved gem | Statuslinje "Ikke gemt – prøver igen", automatisk genforsøg |
| Manglende miljøvariabler | 500, log-besked på serveren |

## Test

- **Vitest-enhedstests** for `netlify/functions/lib/`: signering/verifikation af cookie (gyldig, manipuleret, udløbet), adgangskodetjek, routing af alle ruter inkl. 401/400/404, PUT/GET/DELETE mod in-memory store.
- **Manuel verifikation** med `netlify dev` i browseren: login, opret/redigér/slet, genindlæs og se at data er bevaret, log ud, forkert adgangskode, gem-fejl (stop serveren midt i redigering).

## Uden for scope

Flere brugere, deling, offline-tilstand, migrering af localStorage, versionshistorik, konflikt-detektion.
