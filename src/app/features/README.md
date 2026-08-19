# features — siderne

Én mappe pr. område, og én mappe pr. side inde i den (`features/<område>/<side>/`),
så en side kan vokse med egen CSS og egne tests uden at fylde i naboens mappe. Siderne er tynde: de bygger et lille view-model med
`computed()` ud fra `HomeStore` og viser fliser. Al skrivning går gennem
store'n, alle overlays gennem `DialogService`.

| Rute       | Mappe                     | Viser                                                                                           |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `/`        | `home/`                   | overblik: lys i huset, rum med temperatur, enheder der kræver handling; tomt hus → næste skridt |
| `/rum`     | `rooms/`                  | alle rum med aflæsning og antal enheder                                                         |
| `/rum/:id` | `rooms/room-detail-page/` | ét rums enheder + omdøb/slet rum                                                                |
| `/enheder` | `devices/`                | alle enheder på tværs af rum                                                                    |

Ruterne står i `src/app/app.routes.ts`; `:id` kommer ind som `input.required()`
(component input binding).

## Konventioner

- **View-model i `computed()`.** Sider laver f.eks. `rows = computed<RoomRowVm[]>(…)`
  i stedet for logik i skabelonen. Teksterne kommer fra `shared/device-format.ts`,
  så "Tændt", "Svarer ikke", "3 enheder" staves ét sted.
- **Fliser er delte klasser.** `.tile`, `.tile--warm`, `.tile--alert`, `.grid`
  ligger i `src/styles.scss`; kun det side-specifikke ligger på komponenten.
- **Tomme og fejlende tilstande** bruger `shared/empty-state` (første gang:
  ingen rum endnu) og `shared/load-state` (henter/fejlede) — ikke egne varianter.
  Er der rum, men ikke noget at vise, bliver det en FLISE i gridet, så fanerne og
  layoutet bliver stående: Hjem viser "Ingen enheder endnu" med `Tilføj enhed`
  plus en flise med de rum, der står klar, og Enheder viser sin egen tilsvarende
  flise. Hjem har desuden to regler, der holder forsiden ærlig: lysflisen vises
  kun, når der FINDES en lampe (ellers ville "Alt lys er slukket" være en påstand
  om noget, systemet ikke ved), og har ingen enhed noget at vise på en flise
  (f.eks. kun en bevægelsessensor), træder "Alt ser normalt ud" ind, så forsiden
  aldrig står tom.
- **Langt tryk** på en flise åbner enhedsmenuen via `shared/long-press`
  direktivet, med en tastaturgenvej (`.tile__actions`) som ligeværdig vej.
