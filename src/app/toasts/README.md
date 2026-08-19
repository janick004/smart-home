# toasts — kvitteringer, fejl og fortryd

`ToastHost` (`toast-host/`) viser stakken fra `HomeStore.toasts()` nederst i tabletlærredet.
Selve tilstanden — kø, nedtælling, pause og udskudt arbejde — ligger i store'n
(se `../core/README.md`), så en toast kan overleve, at brugeren skifter side.

To varianter:

- **neutral** — "Luftfugtighed er fjernet" med _Fortryd_. Det destruktive kald
  til API'et er udskudt, indtil nedtællingen løber ud; trykker man Fortryd, sker
  det aldrig.
- **alert** — noget gik galt, f.eks. "Bordlampe svarede ikke — den er stadig
  tændt", typisk med _Prøv igen_.

Nedtællingen vises som en streg i bunden af toasten (`.toast__countdown`, ren
CSS-animation). Hover eller fokus pauser den (`pauseToast` / `resumeToast`), så
handlingen ikke forsvinder under musen — det er derfor pausen ligger i store'n
og ikke i komponenten.
