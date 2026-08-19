import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/** First run, no rooms yet (mockup 05): everything starts with one room. */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <section class="tile empty__tile">
        <span class="empty__hint" i18n="@@empty.hint">Første gang · ingen rum endnu</span>
        <h1 class="empty__title" i18n="@@empty.title">Start med ét rum</h1>
        <p class="empty__text" i18n="@@empty.text">
          Alle enheder hører til et rum. Opret det rum, du sidder i lige nu — resten kan vente.
        </p>
        <button
          type="button"
          class="btn btn--primary empty__cta"
          (click)="create.emit()"
          i18n="@@empty.cta"
        >
          Opret dit første rum
        </button>
      </section>
    </div>
  `,
})
export class EmptyState {
  readonly create = output<void>();
}
