# Stitchboard

Web-app til at tegne strikkeskabeloner, lægge farvemønstre og få rækkerne "læst op" mens du strikker.

**Tre trin**

1. **Skabelon** – tegn en sort kant rundt om de felter du vil strikke mønster på (som cellekanter i Excel). Alt indenfor den lukkede kant er skabelonen. Træk tegner, klik slår en kant til/fra, højre museknap visker ud.
2. **Mønster** – fyld felterne med farver. Den flydende bjælke nederst viser de 5 senest brugte farver; tryk `+` for flere.
3. **Strik** – appen fremhæver én række ad gangen og viser farveskiftene som "5 blå, 3 hvid, 5 blå". Valgfri oplæsning på dansk.

Hver bruger har sin egen konto, og projekter gemmes automatisk i en database (Netlify Blobs), så de er de samme på alle dine enheder. De kan stadig eksporteres/importeres som `.strik.json` eller gemmes som PNG. Skabeloner fra før, der ligger i en browser, hentes op med knappen **Hent … fra denne browser** på forsiden (én gang pr. browser).

## Kør lokalt

Opret en `.env` i roden (den committes ikke):

```
SESSION_SECRET=en-lang-tilfældig-streng
INVITE_CODE=koden-du-giver-til-dem-du-inviterer
OWNER_USERNAME=jens
```

```bash
npm install
npx netlify-cli dev   # åbner http://localhost:8888 med API og lokalt lager
npm test
```

`npm run dev` alene starter kun Vite, uden API – så kan du ikke logge ind.

## Deploy på Netlify

Repoet indeholder `netlify.toml`, så det er nok at:

1. Gå til [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Vælg GitHub og dette repo
3. Under **Site configuration → Environment variables**: sæt `SESSION_SECRET` (fx `openssl rand -hex 32`) og `INVITE_CODE`. Sæt `OWNER_USERNAME` til dit brugernavn, så skabeloner fra før brugerkonti flyttes til din konto første gang du logger ind. Skifter du `SESSION_SECRET`, logges alle enheder ud.
4. Build-kommando `npm run build` og publish-mappe `dist` udfyldes automatisk → **Deploy**

Hver push til `main` deployer automatisk.

## Brugere

**Første deploy:** opret din egen konto (med navnet i `OWNER_USERNAME`) straks efter deploy, *før* du deler invitationskoden – ellers kan den første med koden tage navnet og få de gamle skabeloner. Åbne faner med den gamle version kan ikke logge ind; genindlæs dem.

**Invitér:** giv personen adressen og `INVITE_CODE`. De opretter selv en konto under **Opret konto**. Skift koden i Netlify, hvis den er sluppet ud – eksisterende konti påvirkes ikke.

**Nulstil adgangskode:** kør

```bash
node scripts/reset-password.mjs <brugernavn> <ny-adgangskode>
```

og kør den kommando scriptet udskriver (kræver `npx netlify-cli login` og at mappen er linket med `npx netlify-cli link`). Eksisterende sessioner på brugerens enheder forbliver logget ind.

**Slet bruger:** slet først skabelonerne under `<brugernavn>/` i store `projects` (`blobs:list projects` / `blobs:delete projects <nøgle>`) – ellers arver en ny bruger med samme navn dem. Slet så brugeren med `npx netlify-cli blobs:delete users <brugernavn>`; brugerens enheder logges ud ved næste kald.

## Genveje

| Tast | Funktion |
| --- | --- |
| 1 / 2 / 3 | Skift tilstand |
| K / B | Kant (skabelon) · Pensel (mønster) |
| E | Viskelæder |
| R | Rektangel |
| G | Spand |
| I | Pipette (mønster) |
| M | Spejl til/fra |
| H | Hånd (flyt) |
| Ctrl+Z / Ctrl+Y | Fortryd / gentag |
| Ctrl + scroll | Zoom |
| Mellemrum / → | Næste farveskift (strik) |
| Enter / ↑ | Næste række (strik) |
