import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HomeStore } from '../../core/home-store/home-store';

/**
 * Bottom-center toast stack. Each toast counts down visually and dismisses
 * itself: nothing disappears immediately, and no extra confirm dialog comes first.
 * Hover or keyboard focus pauses the countdown so the action stays reachable.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of store.toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast--alert]="toast.variant === 'alert'"
          [class.toast--paused]="store.pausedToasts().has(toast.id)"
          (mouseenter)="store.pauseToast(toast.id)"
          (mouseleave)="store.resumeToast(toast.id)"
          (focusin)="store.pauseToast(toast.id)"
          (focusout)="store.resumeToast(toast.id)"
        >
          <span class="toast__msg">{{ toast.message }}</span>
          @if (toast.action; as action) {
            <button type="button" class="toast__action" (click)="store.runToastAction(toast.id)">
              {{ action.label }}
            </button>
          }
          <span
            class="toast__countdown"
            [style.animation-duration.ms]="toast.ttlMs"
            aria-hidden="true"
          ></span>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly store = inject(HomeStore);
}
