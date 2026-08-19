# shared — genbrugelige byggesten

Alt her er uafhængigt af sider og af `HomeStore`: komponenter får data ind via
`input()` og melder tilbage via `output()`. Skal en ny side bruge noget, der
allerede findes her, genbruges det — der laves ikke en variant.

| Fil              | Type                            | Bruges til                                                 |
| ---------------- | ------------------------------- | ---------------------------------------------------------- |
| `modal.ts`       | komponent `<app-modal>`         | ramme om alle dialoger: baggrund, fokusfælde, Escape, aria |
| `toggle-switch/` | komponent `<app-toggle-switch>` | tænd/sluk-kontakten (normal og lille)                      |
| `empty-state.ts` | komponent `<app-empty-state>`   | "her er ikke noget endnu" + primær handling                |
| `load-state.ts`  | komponent `<app-load-state>`    | indlæsning og fejl med "Prøv igen"                         |
| `long-press.ts`  | direktiv `[appLongPress]`       | langt tryk på en flise (mus, touch, pen)                   |
| `device-format/` | rene funktioner                 | enhedstekster: tilstand, status, antal, aria-labels        |
| `room-format/`   | rene funktioner                 | ét rums aflæsning og alarmtilstand — delt af Hjem og Rum   |
| `relative-time/` | rene funktioner                 | "for 2 minutter siden", "i går 14:18", klokkeslæt          |

## room-format: ét rum, ét svar

`roomReading()` afgør hvad en rum-flise siger, og bruges af BÅDE forsiden og
Rum-siden, så de aldrig kan påstå to forskellige ting om samme rum. Prioriteten
er bevidst: svarer ingen af rummets enheder → "Svarer ikke"; ellers en rigtig
måling (temperatur før luftfugtighed, nyeste sensor vinder, og en enhed der ikke
svarer bidrager ikke med sit sidste tal); ellers lyset; ellers "Tomt rum" eller
"Ingen målinger endnu". Ét dødt termometer gør altså ikke hele rummet stumt —
tallet bliver stående, og `offlineCount` i svaret fortæller hvor meget der mangler.
Testene i `room-format/room-format.spec.ts` er skrevet som netop de situationer,
en bruger kan ende i.

## Hvorfor rene funktioner frem for pipes

`device-format` og `relative-time` er almindelige funktioner, fordi de kaldes
fra `computed()` i komponenterne — der hvor view-modellen bygges. Det gør dem
trivielle at unit-teste (`device-format/device-format.spec.ts`, `relative-time/relative-time.spec.ts`) og
holder skabelonerne fri for logik.

Tidspunkter formateres med `Intl`, og relative tider tager `now` ind som
argument — komponenten henter det fra `ClockService`, så alle "for X siden"
opdateres af ét fælles ur i stedet for en timer pr. komponent.
