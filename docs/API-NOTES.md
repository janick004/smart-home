# API-noter — det rigtige API vs. appens behov

Appen taler udelukkende med API'et gennem `src/app/core/api/smart-home-api.ts`
(én metode pr. endpoint). Backend'en er **SmartHomeIoT.Api** (ASP.NET Core 8 +
EF Core/Pomelo mod MySQL), kildekode i `~/Documents/SmartHome-Api`.

Alt herunder er **verificeret mod en kørende instans** 2026-08-18 — ikke gættet.

## Sådan kører man de to sammen

```bash
docker compose -f ~/Documents/SmartHome-Api/docker-compose.dev.yml up -d   # API på :5080
npm start                                                                  # appen på :4200
```

Dev-serveren proxy'er `/api` → `http://localhost:5080` (`proxy.conf.json`), så
appen kører same-origin og CORS er ikke i spil. `API_BASE_URL`-tokenet i
`smart-home-api.ts` peger på `/api/v1`; sæt det til f.eks.
`http://raspberrypi.local:5080/api/v1` for at gå direkte til hub'en.

Uden backend: sæt `USE_MOCK_API = true` i `src/app/app.config.ts` — så svarer
`core/api/mock-api.ts` på samme kontrakt.

## De vigtigste forskelle på API'et og domænet

Alle fire håndteres i `core/api/mapping.ts` og INGEN andre steder:

| API'et                                            | Domænet (`core/models.ts`) |
| ------------------------------------------------- | -------------------------- |
| `roomId`/`deviceId`/`dataId`/`eventId` som heltal | `id` som streng            |
| `status: "Online" \| "Offline"`                   | `online: boolean`          |
| Tidsstempler UDEN tidszone (naiv UTC)             | `Date`                     |
| Kommando gemt som prosa i hændelsesloggen         | `on: boolean` på lampen    |

**Tidszone-fælden:** databasen gemmer naiv UTC, og ASP.NET serialiserer det som
`"2026-08-18T11:50:51"` (svar på POST har `Z` med, fordi de kommer fra
`DateTime.UtcNow`). `new Date("2026-08-18T11:50:51")` læser det som LOKAL tid —
to timer skævt om sommeren. Brug altid `parseApiDate()`; og send `from`/`to` med
`toApiTimestamp()` (UTC uden `Z`), så serverens egen tidszone ikke flytter
grænsen.

## Sådan bruges endpointsene

| Endpoint                                                                                                      | Bruges til                                                       |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /rooms`                                                                                                  | rumlisten (Hjem/Rum)                                             |
| `POST /rooms`, `PUT /rooms/{id}`, `DELETE /rooms/{id}`                                                        | opret/omdøb/slet rum (409 håndteres)                             |
| `GET /devices`                                                                                                | enhedslisten                                                     |
| `GET /devices/{id}`                                                                                           | teknik-kortet (MAC/IP/registreret) + "Prøv at finde den igen"    |
| `POST /devices`                                                                                               | registrering af fundet enhed (kræver MAC)                        |
| `PUT /devices/{id}`                                                                                           | omdøb + flyt enhed (HEL erstatning)                              |
| `DELETE /devices/{id}`                                                                                        | fjern enhed — kaldes først når fortryd-vinduet (10 s) er udløbet |
| `GET /devices/{id}/history?range=24h&sensorType=`                                                             | 24-timers-kurven i enhedsdialogen                                |
| `GET /devices/{id}/events`                                                                                    | seneste kommando for én lampe (ved refresh)                      |
| `POST /devices/{id}/command`                                                                                  | tænd/sluk med optimistisk UI + rollback ved HTTP-fejl            |
| `GET /sensordata?from=&take=1000`                                                                             | seneste måling pr. enhed/sensortype ved indlæsning               |
| `GET /eventlog?eventType=CommandIssued&take=1000`                                                             | udledning af lampers tilstand ved indlæsning                     |
| `GET /dashboard/summary`                                                                                      | implementeret i klienten; bruges ikke i UI endnu                 |
| `GET /rooms/{id}`, `GET /rooms/{id}/devices`, `POST /sensordata`, `DELETE /sensordata/{id}`, `POST /eventlog` | implementeret (kontrakt-komplet), ikke brugt af UI               |

Konventioner appen regner med i databasen:

- `Device.Type` ∈ `lamp` | `thermometer` | `motion` | `humidity` (aliasser som
  `light`, `temperature`, `pir` oversættes; ukendte typer springes over med en
  advarsel i konsollen — de har ingen flise).
- `SensorData.SensorType` ∈ `temperature` (°C) | `humidity` (%) | `motion` (bool).
  `light` og `power` ignoreres af UI'et.

## Ønsker til API'et (vigtigst først)

1. **Enheds-tilstand (tændt/slukket).** `GET /devices` har intet state-felt, så
   appen udleder tilstanden ved at læse kommandoen ud af den seneste
   `CommandIssued`-hændelses **beskrivelse** (`Command 'ON' issued to device
'Loftlampe'.`). Det er skrøbeligt: prosa-parsing, manuelle kontakter tælles
   ikke med, og kommandoer der aldrig nåede enheden ser ud som succes. Ønske:
   `state` på device, eller `GET /devices/{id}/state`.
2. **Kommando-kvittering.** `POST /devices/{id}/command` svarer 202 for enhver
   eksisterende enhed — også en offline en. UI'et er bygget om optimistisk skift
   - rollback, men kan kun rulle tilbage på en HTTP-fejl. Ønske: statuskode/felt
     der siger om enheden kvitterede (eller push, se punkt 8).
3. **Strukturerede kommando-hændelser.** Hvis kommandoen (og resultatet) stod i
   egne felter i stedet for i `Description`, forsvandt hele parsingen.
4. **Seneste målinger i bulk.** Der findes ingen "nuværende værdi pr. enhed";
   appen henter `GET /sensordata?from=<48 t siden>&take=1000` og grupperer
   klient-side. Med mange enheder rammer man `take`-loftet (1000). Ønske:
   `lastReadings` i `GET /devices` eller `GET /devices/latest-readings`.
5. **Discovery/parring — frontend'en er klar, endpointet mangler.**
   "Tilføj enhed" kalder nu `GET /devices/discovered` og viser resultatet som en
   liste, man vælger fra. Endpointet findes ikke i API'et endnu, så kaldet svarer
   404, og dialogen siger _"Vi kunne ikke spørge hjemmet om nye enheder lige nu"_
   i stedet for at simulere et fund. Mock-backend'en implementerer det, så flowet
   kan køres og testes. Den form klienten forventer (`DiscoveredDeviceDto`):

   ```json
   [
     {
       "macAddress": "A4:CF:12:AA:01:02",
       "iPv4Address": "192.168.1.120",
       "type": "thermometer",
       "suggestedName": "Termometer",
       "lastSeen": "2026-08-19T10:02:00"
     }
   ]
   ```

   Kun `macAddress` er påkrævet — den er identiteten, `POST /devices`
   registrerer på. `type` og `suggestedName` må gerne være `null`: en enhed på
   wifi'et annoncerer ikke nødvendigvis hvad den er, og så vælger brugeren typen
   i dialogen. En registreret MAC bør forsvinde fra listen.

   Kilden til listen kan være MQTT: `MqttService` på `master` lytter allerede på
   `smarthome/device/+/sensor/#`. Et topic med en MAC (i stedet for et
   database-id) ville gøre en ukendt enhed til en "set, men ikke registreret"-række
   — og samtidig fjerne det nuværende hønen-og-ægget, hvor firmwaren skal kende
   sit database-id, før den kan sende noget.

6. **Ping/health-check pr. enhed.** Fejlfindingsdialogen re-checker via
   `GET /devices/{id}`. Et rigtigt `POST /devices/{id}/ping` ville være bedre.
7. **Soft delete / restore.** `DELETE /devices/{id}` kaskaderer historikken
   uigenkaldeligt. Appens 10-sekunders fortryd løses ved at UDSKYDE DELETE til
   vinduet er udløbet (lukkes appen midt i vinduet, sker sletningen aldrig).
8. **Realtime push.** Målinger og status er statiske efter indlæsning; websocket
   eller SSE ville gøre fliserne levende — og løse punkt 2.
9. **Bulk-operationer (nice-to-have).** "Sluk alle" sender én kommando pr.
   lampe, og flyt-alle-enheder ved rum-sletning er én PUT pr. enhed.

## Ting jeg rettede i API'et undervejs

Begge var 500-fejl på de to endpoints appen bruger mest
(`Controllers/RoomsController.cs`):

1. `GET /rooms` sorterede på et projiceret DTO-felt (`.Select(...).OrderBy(...)`),
   som EF Core ikke kan oversætte til SQL → sortér før projektionen.
2. `GET /rooms/{id}` brugte `.Include(r => r.Devices).ThenInclude(d => d.Room)`,
   altså en cyklus, som en no-tracking-forespørgsel afviser → rumnavnet sættes
   direkte i stedet.

Uændret, men værd at kende: `POST /devices` skriver sin
`DeviceRegistered`-hændelse **uden** `DeviceId`, og
`GET /devices/{id}/events` sender `deviceName: null` (den laver ingen
`Include(e => e.Device)`, hvor `GET /eventlog` gør).

## i18n

Angulars egen i18n-pipeline (`@angular/localize`) er sat op med
`sourceLocale: "da"`. Alle tekster er markeret (`i18n`-attributter i templates,
`$localize` i TS) og `npx ng extract-i18n` genererer `messages.xlf`. Nyt sprog =
oversat kopi af filen + en `locales`-post i `angular.json`.
