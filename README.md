# Strikkeskabelon

Web-app til at tegne strikkeskabeloner, lægge farvemønstre og få rækkerne "læst op" mens du strikker.

**Tre trin**

1. **Skabelon** – tegn udsnittet af det du vil strikke (fx en sok) i et pixel-grid. Den lilla kant viser skabelonen.
2. **Mønster** – fyld felterne med farver. Den flydende bjælke nederst viser de 5 senest brugte farver; tryk `+` for flere.
3. **Strik** – appen fremhæver én række ad gangen og viser farveskiftene som "5 blå, 3 hvid, 5 blå". Valgfri oplæsning på dansk.

Projekter gemmes automatisk i browseren (localStorage) og kan eksporteres/importeres som `.strik.json` eller gemmes som PNG.

## Kør lokalt

```bash
npm install
npm run dev
```

## Deploy på Netlify

Repoet indeholder `netlify.toml`, så det er nok at:

1. Gå til [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Vælg GitHub og dette repo
3. Build-kommando `npm run build` og publish-mappe `dist` udfyldes automatisk → **Deploy**

Hver push til `main` deployer automatisk.

## Genveje

| Tast | Funktion |
| --- | --- |
| 1 / 2 / 3 | Skift tilstand |
| B | Pensel |
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
