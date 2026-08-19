import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Shared overlay wrapper: dark backdrop, centered panel, Escape/backdrop closes. */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <div
      class="backdrop"
      (pointerdown)="onBackdropPointerDown($event)"
      (click)="onBackdropClick($event)"
      (keydown.tab)="trapTab($event, false)"
      (keydown.shift.tab)="trapTab($event, true)"
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="label()"
        tabindex="-1"
        #panel
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class Modal {
  readonly label = input.required<string>();
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private pressStartedOnBackdrop = false;

  constructor() {
    afterNextRender(() => this.panel().nativeElement.focus());
  }

  protected onBackdropPointerDown(event: PointerEvent): void {
    this.pressStartedOnBackdrop = event.target === event.currentTarget;
  }

  /**
   * Close only when the whole press happened on the backdrop. A drag that starts
   * in an input and is released outside the panel produces a click whose target
   * is the backdrop — that must not throw the user's input away.
   */
  protected onBackdropClick(event: MouseEvent): void {
    const pressStartedHere = this.pressStartedOnBackdrop;
    this.pressStartedOnBackdrop = false;
    if (event.target === event.currentTarget && pressStartedHere) {
      this.closed.emit();
    }
  }

  /** aria-modal promises the page behind is unavailable — keep Tab inside the panel. */
  protected trapTab(event: Event, backwards: boolean): void {
    const panel = this.panel().nativeElement;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('disabled') && element.offsetParent !== null,
    );
    if (focusables.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (backwards && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!backwards && active === last) {
      event.preventDefault();
      first.focus();
    } else if (active !== panel && (!(active instanceof HTMLElement) || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}
