# core — tilstand, API og domæne

Ingen UI her. `core` ved hvad et hjem _er_, og hvordan man taler med serveren.

| Fil                     | Ansvar                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- |
| `models.ts`             | domænetyper: `Room`, `Device` (union pr. enhedstype), `Toast` …                   |
| `api/api-types.ts`      | DTO'er — det rigtige API's format, aldrig brugt direkte i UI                      |
| `api/smart-home-api.ts` | én metode pr. endpoint på SmartHomeIoT.Api, intet mere                            |
| `api/mapping.ts`        | rene funktioner API ↔ domæne (`parseApiDate`, `mapDevice`, `toDeviceUpdateDto` …) |
| `api/mock-api.ts`       | HTTP-interceptor der svarer som API'et — til demo og tests uden backend           |
| `home-store.ts`         | al hjem-tilstand som signals + alle skrivninger                                   |
| `dialog.ts`             | hvilken dialog er åben (én ad gangen) + fokus tilbage til den der åbnede          |
| `clock.ts`              | ét fælles tikkende `now`-signal til relative tidsangivelser                       |
| `discovery/`            | spørger API'et hvilke enheder der er set på nettet, men ikke registreret          |

## HomeStore

Systemets eneste kilde til sandhed. Komponenter læser `rooms()`, `devices()`,
`toasts()`, `status()` og kalder metoder som `toggleLamp()`, `moveDevice()`,
`removeDevice()`. Ingen komponent kalder `SmartHomeApi` selv.

To mønstre er værd at kende:

**Optimistisk skift med rollback.** `toggleLamp()` flipper lampen i UI'et med
det samme og sender kommandoen bagefter. Fejler den, ruller tilstanden tilbage,
og en advarsels-toast tilbyder "Prøv igen". `pendingSwitch` holder styr på
kommandoer undervejs, så én lampe kun har én kommando ad gangen.

**Udskudt sletning ("Fortryd i 10 sekunder").** API'et har ingen blød sletning,
så `DELETE` sendes _først_ når fortryd-vinduet er udløbet. Indtil da er enheden
kun væk i UI'et. Derfor:

- `showToast({ onExpire })` bærer det destruktive kald,
- `runToastAction()` (Fortryd) annullerer det,
- `load()` afvikler alle ventende sletninger, før hjemmet hentes igen — ellers
  ville en genindlæsning genoplive noget, brugeren har slettet.

Rækkefølgen er vigtig i `deleteRoom()`: ventende enhedssletninger i rummet
committes først, så den udskudte rum-sletning ikke fejler på en enhed, serveren
allerede har mistet.

## Mod det rigtige API — og tilbage til mocken

Appen kører som standard mod det rigtige API (`SmartHomeIoT.Api` på :5080) via
dev-serverens proxy; `USE_MOCK_API` i `app.config.ts` skifter til mock-dataene.
`API_BASE_URL`-tokenet i `smart-home-api.ts` peger på `/api/v1` og kan sættes til
hub'ens adresse i stedet.

Tre ting, API'et gør anderledes end domænet — alle håndteret i `api/mapping.ts`:

- **Heltals-id'er** bliver strenge (`toApiId` den anden vej).
- **Tidsstempler uden tidszone** (naiv UTC): brug `parseApiDate()`, ikke
  `new Date(...)`, og send `from`/`to` med `toApiTimestamp()`.
- **Ingen tændt/slukket-tilstand:** lampens `on` læses ud af beskrivelsen på den
  seneste `CommandIssued`-hændelse, og `PUT /devices/{id}` er en HEL erstatning
  (brug `toDeviceUpdateDto()`). MAC, IP og registreringsdato findes kun i
  `GET /devices/{id}` — derfor er de `null`, til detaljen er hentet.

Se [../../../docs/API-NOTES.md](../../../docs/API-NOTES.md) for endpoint-brug,
konventioner i databasen og ønskelisten til API'et.
