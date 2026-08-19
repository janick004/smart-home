# Smart hjem — arbejdsregler

Læs [README.md](README.md) (afsnittet "Standarder for koden") før ændringer.
Kort version:

- Én ting pr. mappe: hver komponent/direktiv/service ligger i sin egen mappe med
  sin skabelon, CSS og tests (`shared/modal/modal.ts`, `features/rooms/rooms-page/…`).
  Læg aldrig en ny komponent som løs fil i en fællesmappe. Kun rene typefiler
  (`core/models.ts`) står alene.
- Hvert område har en `README.md`; komponentens CSS bor på komponenten, kun
  tokens og delte klasser i `src/styles.scss`.
- Genbrug `shared/`-komponenterne frem for at lave varianter.
- **Ingen Bootstrap eller andre UI-frameworks** — alt bygges specifikt til systemet.
- Al hjem-tilstand går gennem `HomeStore`; kun `SmartHomeApi` taler HTTP.
- Systemet vises ALTID som en iPad i landskab (1366×1024), skaleret ned til
  vinduet. Ingen mobilversion, ingen portrætudgave, ingen media queries. Nye
  overlays skal ligge inde i `<app-tablet-frame>` (se `src/app/layout/README.md`).
- **Opdatér [docs/class-diagram.md](docs/class-diagram.md) i samme commit** som
  klasser, offentlige signals/metoder eller afhængigheder ændrer sig.
- Kør `npm test` og `npx prettier --write .` før commit. CLI'en kaldes med `npx ng …`.
