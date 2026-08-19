import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { StoreStatus } from '../../core/home-store/home-store';

/** Loading/error gate shown while the home is being fetched from the API. */
@Component({
  selector: 'app-load-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      @if (status() === 'error') {
        <section class="tile empty__tile">
          <h1 class="empty__title" i18n="@@load.errorTitle">Hjemmet kunne ikke hentes</h1>
          <p class="empty__text" i18n="@@load.errorText">
            Vi kunne ikke få fat i dit hjem lige nu. Tjek forbindelsen og prøv igen.
          </p>
          <button
            type="button"
            class="btn btn--primary empty__cta"
            (click)="retry.emit()"
            i18n="@@load.retry"
          >
            Prøv igen
          </button>
        </section>
      } @else {
        <section class="tile empty__tile loading" aria-live="polite">
          <span class="loading__pulse" aria-hidden="true"></span>
          <span class="empty__text" i18n="@@load.loading">Henter dit hjem…</span>
        </section>
      }
    </div>
  `,
  styles: `
    .loading {
      flex-direction: row;
      align-items: center;
      gap: 14px;
    }

    .loading__pulse {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--text-3);
      animation: load-pulse 1.1s ease-in-out infinite;
      flex: none;
    }

    @keyframes load-pulse {
      0%,
      100% {
        opacity: 0.35;
        transform: scale(0.8);
      }

      50% {
        opacity: 1;
        transform: scale(1.1);
      }
    }
  `,
})
export class LoadState {
  readonly status = input.required<StoreStatus>();
  readonly retry = output<void>();
}
