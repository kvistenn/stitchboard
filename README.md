# Stitchboard

Web-app til at tegne strikkeskabeloner, lægge farvemønstre og få rækkerne "læst op" mens du strikker.

**Tre trin**

1. **Skabelon** – tegn en sort kant rundt om de felter du vil strikke mønster på (som cellekanter i Excel). Alt indenfor den lukkede kant er skabelonen. Træk tegner, klik slår en kant til/fra, højre museknap visker ud.
2. **Mønster** – fyld felterne med farver. Den flydende bjælke nederst viser de 5 senest brugte farver; tryk `+` for flere.
3. **Strik** – appen fremhæver én række ad gangen og viser farveskiftene som "5 blå, 3 hvid, 5 blå". Valgfri oplæsning på dansk.

Projekter gemmes automatisk i en database (Netlify Blobs) bag en adgangskode, så de er de samme på alle dine enheder. De kan stadig eksporteres/importeres som `.strik.json` eller gemmes som PNG.

## Kør lokalt

Opret en `.env` i roden (den committes ikke):

```
STITCHBOARD_PASSWORD=din-adgangskode
SESSION_SECRET=en-lang-tilfældig-streng
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
3. Under **Site configuration → Environment variables**: sæt `STITCHBOARD_PASSWORD` og `SESSION_SECRET` (fx `openssl rand -hex 32`). Skifter du `SESSION_SECRET`, logges alle enheder ud.
4. Build-kommando `npm run build` og publish-mappe `dist` udfyldes automatisk → **Deploy**

Hver push til `main` deployer automatisk.

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
