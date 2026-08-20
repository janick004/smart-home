# Smart hjem test

Angular-app til et smart hjem: rum, enheder (lamper, termometre, bevægelses- og
fugtsensorer), tænd/sluk med fortryd-vindue, og advarsler når en enhed ikke
svarer. UI'et er bygget direkte efter mockuppen — mørkt, store fliser, varm
farve = tændt, rød = kræver handling.

```bash
docker compose -f ../SmartHome-Api/docker-compose.dev.yml up -d   # API'et på :5080
npm start                                                         # appen på :4200
```

→ <http://localhost:4200/>. Der er ingen global Angular CLI i projektet; kør
kommandoerne med `npx ng …` (eller npm-scriptene nedenfor).

Appen henter alt fra det rigtige REST-API (**SmartHomeIoT.Api**, ASP.NET Core +
MySQL). Dev-serveren proxy'er `/api` → `http://localhost:5080`
(`proxy.conf.json`), så der er ingen CORS i spil. Uden backend: sæt
`USE_MOCK_API = true` i `src/app/app.config.ts`, så svarer mock-backend'en i
`core/api/mock-api.ts` på præcis samme kontrakt.

| Kommando                 | Gør                          |
| ------------------------ | ---------------------------- |
| `npm start`              | dev-server på :4200          |
| `npm test`               | unit-tests (Vitest)          |
| `npm run build`          | produktionsbuild til `dist/` |
| `npx prettier --write .` | formatering                  |

## Sådan hænger systemet sammen

```
src/app/
├─ core/       tilstand, API-klient, domænetyper (ingen UI)
│  ├─ api/     ét sted der taler HTTP + DTO→domæne
│  ├─ home-store/, dialog/, clock/, discovery/
│  └─ models.ts
├─ layout/     app-skallens ramme (iPad-lærredet)
│  └─ tablet-frame/
├─ features/   ét område pr. mappe, én side pr. undermappe
│  ├─ home/home-page/
│  ├─ rooms/rooms-page/, rooms/room-detail-page/
│  └─ devices/devices-page/
├─ dialogs/    én mappe pr. overlay + dialog-host/ der vælger dem
├─ shared/     én mappe pr. genbrugelig komponent, direktiv eller funktion
└─ toasts/     toast-stakken (fortryd, fejl, kvitteringer)
```

**Én ting pr. mappe.** En komponent, et direktiv eller en service ligger i sin
egen mappe sammen med sin skabelon, sin CSS og sine tests — aldrig som løse
filer side om side med naboens. Kun rene typefiler (`core/models.ts`) ligger
som enkeltfil.

Hver områdemappe har sin egen `README.md` med detaljerne. Overordnet:

- **Én kilde til tilstand.** `HomeStore` (core) ejer rum, enheder og toasts som
  signals. Komponenter læser signals og kalder store-metoder — de taler aldrig
  HTTP selv.
- **Ét sted der taler HTTP.** `SmartHomeApi` (core/api) har én metode pr.
  endpoint, og `core/api/mapping.ts` er det ENESTE sted, API'ets form oversættes
  til domænet (heltals-id'er, tidsstempler uden tidszone, lampetilstand udledt
  af hændelsesloggen). Se [docs/API-NOTES.md](docs/API-NOTES.md) for
  endpoint-brug og ønskelisten til API'et.
- **Overlays styres af `DialogService`** — én åben ad gangen, valgt af
  `DialogHost`.

Klassediagram (skal holdes opdateret sammen med koden):
[docs/class-diagram.md](docs/class-diagram.md).

## Standarder for koden

Disse regler gælder hele systemet:

1. **Moduler med egen CSS.** Funktionalitet ligger i sin egen mappe, og en
   komponents styling ligger på komponenten (`styleUrl` eller `styles`), ikke i
   den globale fil. Globale filer indeholder kun designtokens og de klasser,
   flere sider deler (`.tile`, `.btn`, `.field`, `.modal` … i
   [`src/styles.scss`](src/styles.scss)).
2. **Genbrug frem for kopi.** Fælles UI (modal, kontakt, tom-tilstand,
   indlæsnings-/fejltilstand, langt tryk) ligger i `shared/` og bruges af alle
   sider og dialoger.
3. **SOLID, uden overteknik.** Én grund til at ændre hver klasse: API-klienten
   kender kun HTTP, mapping kender kun DTO → domæne, store'n kender kun
   tilstand, komponenter kender kun visning. Nye enhedstyper tilføjes i
   `models.ts` + `mapping.ts` uden at ændre eksisterende typer.
4. **Ingen Bootstrap eller andet UI-framework.** Al styling og alle komponenter
   er skrevet specifikt til systemet. Eneste eksterne afhængighed i UI'et er
   skrifttypen Manrope. Tilføj ikke et komponentbibliotek — byg komponenten i
   `shared/`.
5. **README pr. mappe** som kodedokumentation, og et **klassediagram** der
   opdateres i samme commit som koden.

## Tabletrammen

Systemet findes kun i én form: en **iPad i landskab, 1366 × 1024**. Appen tegnes
altid på det lærred — vist som en iPad med ramme, kamera og glasrefleks — og
skaleres som helhed ned, så den passer i vinduet. Der er **ingen mobilversion og
ingen portrætudgave**; et lille vindue viser en mindre iPad.

Derfor har systemet heller ingen media queries: et breakpoint ville måle på
browservinduet i stedet for på lærredet.

Rammen er `layout/tablet-frame` — se
[src/app/layout/README.md](src/app/layout/README.md) for skaleringen og for
hvordan modaler og toasts holdes inde i rammen.

## Sprog

UI-teksten er dansk og markeret med Angular i18n (`$localize` / `i18n`), med
id'er på formen `@@store.undo`. `messages.xlf` er den udtrukne kilde.
