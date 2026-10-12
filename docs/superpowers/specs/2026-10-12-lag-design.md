# Lag i mønster-tilstand – design

Dato: 2026-10-12

## Formål

Mønster-tilstand får lag, så man kan:

1. **Flytte et motiv uden at ødelægge det der ligger under** – fx en figur på ét lag og en baggrund på et andet.
2. **Prøve varianter** – slå lag til og fra for at sammenligne (fx "med stjerner" / "uden stjerner").

Succes: man kan tegne på flere lag, flytte et helt lag eller en markering på ét lag uden at røre de andre, skjule lag, og Strik-tilstand + PNG viser præcis det man ser.

## Beslutninger

| Spørgsmål | Valg |
|---|---|
| Hvad strikkes / eksporteres? | Kun **synlige** lag, lagt ovenpå hinanden ("det du ser er det du strikker") |
| Hvid og gennemsigtighed | Tomt felt (`null`) = gennemsigtigt. Viskelæderet gør gennemsigtigt. Paletfarven "Hvid" (`#ffffff`) dækker som en rigtig farve. Under nederste lag er bunden hvid som i dag |
| Flytte indhold | Markér-værktøjet virker på det aktive lag; Flyt rundt flytter hele det aktive lag |
| Datamodel | `layers` er sandheden; `colors` er en afledt sammenlægning (se nedenfor) |

Fravalgt: kun `layers` uden `colors` (alle læsere skulle skrives om, risiko for strik-logikken) og lag med forskydning `{offsetR, offsetC, cells}` (pænest til flytning, men markant mere kompliceret at male/fylde/markere i – YAGNI).

## Datamodel

```js
project.layers = [
  { id, name, visible, colors: [] }, // nederste lag først; colors er fladt, række-først (i = r*cols + c); null = gennemsigtig
]
project.colors // AFLEDT: for hvert felt øverste synlige lags farve, ellers null
```

- **Al skrivning** af lag går gennem `setLayers(project, layers)`, som også genberegner `colors`. Ingen kode må skrive direkte til `project.colors`.
- Hvilket lag der er **aktivt**, er editor-state (ikke en del af projektet). Ved åbning er det øverste lag aktivt.

### Nye rene funktioner i `src/state.js`

| Funktion | Gør |
|---|---|
| `flattenLayers(layers, n)` | Sammenlægning af synlige lag → `colors` |
| `setLayers(project, layers)` | Sætter lag og genberegner `colors` |
| `ensureLayers(project)` | Gammelt projekt uden `layers` → ét lag "Lag 1" med de nuværende `colors`. Uændret hvis `layers` findes |
| `addLayer(project, index, name)` | Tomt lag indsat over `index` |
| `duplicateLayer(project, index)` | Kopi af laget lige over det, navn "<navn> (kopi)" |
| `removeLayer(project, index)` | Fjerner laget; det sidste lag kan ikke fjernes |
| `moveLayerOrder(project, index, delta)` | Flytter laget op/ned i rækkefølgen |
| `toggleLayer(project, index)` | Slår synlighed til/fra |
| `renameLayer(project, index, name)` | Omdøber |
| `shiftLayer(project, index, dr, dc)` | Flytter hele lagets indhold; holdt indenfor gridet så intet falder af |
| `layerBounds(colors, cols)` | Indholdets omkreds `{r0,c0,r1,c1}` eller null (bruges til at begrænse flytning) |

Nye lag får navnet "Lag N", hvor N er det laveste ledige tal.

## Brugerflade

### Lagpanel (sidepanelet i Mønster-tilstand)

- Liste med øverste lag øverst. Hver række: 👁 synlig/skjult · navn (dobbeltklik / langt tryk for at omdøbe) · ▲▼ rækkefølge · 🗑 slet.
- Klik på en række gør laget aktivt; den aktive række er fremhævet.
- Slet spørger med `confirm` hvis laget har indhold. Det sidste lag kan ikke slettes (knappen er deaktiveret).
- Under listen: **+ Nyt lag** (tomt lag over det aktive, bliver aktivt) og **Dupliker lag**.
- På mobil ligger listen i det sammenklappelige infopanel.

### Tegning

- Pensel, viskelæder, udfyld, spand, Markér (flyt/ryd), Delete på markør-feltet og kopiér/indsæt virker **kun på det aktive lag**.
- Er det aktive lag skjult, sker der intet ved tegning, og panelet viser "Laget er skjult – slå det til for at tegne".
- **Spanden** finder området ud fra sammenlægningen (det man ser) men skriver kun på det aktive lag.
- "Ryd mønster" bliver til **"Ryd lag"** og rydder kun det aktive lag.
- Under et strøg tegner GridCanvas lokalt på det aktive lags kopi og viser sammenlægningen, så tegningen forbliver flydende; ét commit pr. strøg som i dag.

### Flyt et helt lag (Flyt rundt i Mønster-tilstand)

- Træk startet på et felt med indhold **på det aktive lag** → hele laget flyttes (live forhåndsvisning).
- Træk startet på et tomt felt → lærredet panoreres som i dag.
- Musemarkør: `move` over indhold, `grab` ellers.
- Piletaster med Flyt rundt valgt flytter det aktive lag ét felt.
- Flytningen begrænses så indholdet bliver indenfor gridet. Ét fortryd-skridt pr. træk.

## Samspil med eksisterende funktioner

| Funktion | Ændring |
|---|---|
| `floodFill` | Tager sammenlægning til områdefinding, skriver på aktivt lag |
| `moveCells`, `pasteRegion`, `copyRegion`, Delete, "Ryd lag" | Arbejder på det aktive lags `colors` |
| `moveTemplate` | Flytter skabelonens felter på **alle** lag |
| `copyTemplate` / `pasteTemplate` | Gemmer en farve pr. lag pr. felt (efter lagets indeks); mangler projektet lag ved indsættelse, oprettes de |
| `cropToTemplate` | Beskærer alle lag |
| `resizeProject` | Ændrer størrelse på alle lag |
| Fortryd (`snap` i Editor) | Gemmer `layers` (+ afledt `colors`) |
| `normalizeImport` | Kalder `ensureLayers` |
| Editor ved åbning | Kalder `ensureLayers` (uden historik) så projekter fra databasen konverteres |
| Strikkeplan, `rowSegments`, PNG, Home-miniaturer, server-validering | **Uændret** – læser `colors` (= synlige lag) |

## Ydelse

- Sammenlægning ved 300×300 og 5 lag ≈ 450.000 opslag – få ms pr. commit, ét commit pr. strøg.
- Filstørrelse vokser lineært med antal lag (300×300×5 ≈ 2–3 MB JSON). Accepteres nu; kan senere komprimeres (run-length).

## Test

Vitest på alle nye funktioner i `state.js`, plus:

- `ensureLayers` på gammelt projekt bevarer farverne; på nyt projekt er den uændret.
- Invariant: efter hver skrivende funktion (`setLayers`, `floodFill`-flow, `moveTemplate`, `cropToTemplate`, `resizeProject`, `pasteTemplate`, `shiftLayer`) gælder `colors === flattenLayers(layers)`.
- Skjult lag påvirker ikke `colors`; hvid på øvre lag dækker; `null` på øvre lag er gennemsigtig.
- `shiftLayer` taber aldrig indhold over kanten.
- Manuel browser-test: tegn på to lag, flyt det ene, skjul det, tjek Strik-tilstand og PNG.

## Udenfor scope

Lag i Skabelon-tilstand, gennemsigtighed pr. lag (opacity), låste lag, blandingstilstande, flet lag, træk-og-slip i lagpanelet, komprimeret lagring.
