# dialogs — alle overlays

Der er højst én dialog åben ad gangen. `DialogService` (i `core/dialog.ts`)
holder tilstanden, `DialogHost` vælger komponenten, og hver dialog pakker sit
indhold i `<app-modal>` fra `shared/`.

```
DialogService.open({ kind: 'move-device', deviceId })
        │
        ▼
DialogHost  ──> MoveDeviceDialog ──> <app-modal> ──> HomeStore.moveDevice()
```

| `kind`                          | Komponent               | Gør                                              |
| ------------------------------- | ----------------------- | ------------------------------------------------ |
| `add-device`                    | `add-device-dialog`     | søger på wifi, foreslår navn og rum, registrerer |
| `create-room`                   | `create-room-dialog`    | opretter rum, med forslag og dublet-advarsel     |
| `rename-room` / `rename-device` | `rename-dialog`         | ét omdøbnings-flow for begge (`RenameTarget`)    |
| `delete-room`                   | `delete-room-dialog`    | sletter rum og beder om nyt hjem til enhederne   |
| `device-menu`                   | `device-menu-sheet`     | menuen fra langt tryk: omdøb, flyt, fjern        |
| `move-device`                   | `move-device-dialog`    | flytter enhed til andet rum                      |
| `device-detail`                 | `device-detail-dialog/` | måleværdier, 24-timers kurve, ping, historik     |

## Regler

- **Dialoger kalder store'n, ikke API'et.** Ingen HTTP her.
- **Kæder bevarer fokus.** Åbner enhedsmenuen en omdøbnings-dialog, huskes den
  _oprindelige_ åbner, så fokus lander tilbage på flisen, man startede fra.
  Det håndteres af `DialogService`, ikke af de enkelte dialoger.
- **Nye dialoger:** tilføj en variant i `DialogState`, en gren i `DialogHost`,
  og en komponent der bruger `<app-modal>`. `DialogState` er en diskrimineret
  union, så en glemt gren fanges af typetjek.
- **Ramme først.** Dialogerne bor inde i `<app-tablet-frame>` (se
  `../layout/README.md`) — derfor lægger de sig oven på tabletten og ikke oven
  på hele skærmen.
