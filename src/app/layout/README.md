# layout — app-skallens ramme

## `tablet-frame`

Systemet findes kun i én form: en **iPad i landskab, 1366 × 1024**. Appen
tegnes altid på det lærred og skaleres som helhed ned, så den passer i vinduet.
Der er ingen portrætudgave og ingen mobilversion — et smalt vindue viser en
mindre iPad, aldrig et andet design.

Enheden er med vilje enkel: sort glasfront, tynd aluminiumskant, kamera og en
skygge. Ikke andet — det er appen, man skal kigge på.

```
app.html
└─ <app-tablet-frame>            ← baggrund, skalering
   └─ .tablet-frame__fit         ← fylder præcis den skalerede størrelse
      └─ .tablet-frame__device   ← glasfront, aluminiumskant  (transform: scale)
         ├─ .tablet-frame__camera  ← kamera i topkanten
         └─ .tablet-frame__screen  ← selve skærmen (ruller indeni)
            ├─ <div class="frame"> … topbar + <router-outlet> … </div>
            ├─ <app-dialog-host />   ← skal ligge INDE i rammen
            └─ <app-toast-host />    ← skal ligge INDE i rammen
```

Rammen er ren sort (`#000`), mens skærmen har appens baggrund plus en hårfin
kant. Uden den forskel flyder ramme og skærm sammen, og man kan ikke se hvor
displayet begynder — hjørnerne forsvinder.

### Skalering

Komponenten regner én ting ud: `--frame-scale`.

```
scale = min(1, (vinduets bredde − 2·28) / (1366 + 2·36),
               (vinduets højde − 2·28) / (1024 + 2·36))
```

- Aldrig over 1 — designet strækkes ikke ud over de pixels, det er tegnet til.
- `.tablet-frame__fit` får den _skalerede_ størrelse, mens `.tablet-frame__device`
  beholder sin fulde størrelse og skaleres med `transform: scale()` fra øverste
  venstre hjørne. Derfor fylder rammen præcis sin plads i layoutet, og vinduet
  får aldrig scrollbars.
- Vinduets mål læses som `document.documentElement.clientWidth/clientHeight` —
  **ikke** `window.innerWidth/innerHeight`, som rapporterer den visuelle viewport
  og giver forkerte tal ved zoom eller i en device-emulator.

### Hvorfor overlays skal ligge inde i rammen

Modaler, toasts og menu-baggrunden bruger `position: fixed`. Fixed måles mod
viewporten — altså hele vinduet — og ville derfor lægge sig uden om iPad'en.

To ting løser det, og begge kræver at overlays er projiceret ind i komponenten:

1. `.tablet-frame__device` har `transform: scale(...)`. Et transformeret element
   bliver "containing block" for `position: fixed` efterkommere — nærmere bestemt
   dets **padding-boks**. Derfor er rammen lavet som en gennemsigtig `border`
   (`border: var(--bezel) solid transparent` + `background-clip: border-box`) og
   ikke som `padding`: med padding ville en toast med `bottom: 28px` måle fra
   aluminiumskanten og hænge ud over rammen; med border måler den fra selve
   skærmen. Aluminiumsforløbet males stadig under den gennemsigtige kant.
2. Rammen sætter `--app-w` / `--app-h` til lærredets mål. Alt der ellers ville
   skrive `100dvh` eller `100vw`, bruger de to variabler:

   ```scss
   .modal {
     max-height: min(760px, calc(0.92 * var(--app-h)));
   }
   .toasts {
     width: min(560px, calc(var(--app-w) - 48px));
   }
   ```

Rullning sker i `.tablet-frame__screen` — ikke på `body` — så enheden står fast,
mens indholdet ruller. Skærmen har ingen synlig scrollbar; en tablet har ikke en.

### Mål

| Token / konstant                            | Værdi               | Bruges til                       |
| ------------------------------------------- | ------------------- | -------------------------------- |
| `--canvas-w` / `--canvas-h` (`styles.scss`) | `1366px` / `1024px` | designlærredet                   |
| `BEZEL` (`tablet-frame.ts`)                 | `36`                | ramme omkring skærmen            |
| `GUTTER` (`tablet-frame.ts`)                | `28`                | luft mellem enhed og vindueskant |
| `--radius-device` / `--radius-screen`       | `66px` / `30px`     | enhedens og skærmens hjørner     |

Ændrer du lærredet, skal `BEZEL` og tokens følges ad — skaleringen bruger begge.
Skærmens hjørneradius skrives aldrig i hånden: den regnes som enhedens radius
minus rammen, så hjørnerne altid er koncentriske.

### Ingen media queries

Fordi appen altid tegnes på det samme lærred, findes der ingen breakpoints i
systemet. **Tilføj ikke media queries:** de ville måle på browservinduet, ikke på
lærredet, og dermed ændre designet, selvom iPad'en er lige stor.

### Sider skal fylde lærredet

Den routede side får `flex: 1` fra en **global** regel i `styles.scss`
(`.content > *:not(router-outlet)`). Reglen kan ikke ligge i `app.scss`:
routeren opretter sideelementet uden for `App`s skabelon, så det har ingen
encapsulation-attribut, og `app.scss`' selektorer rammer det aldrig. Uden
reglen stopper flisegitteret midt på skærmen.
