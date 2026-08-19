import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** The pill switch from the mockup: warm track when on, dark knob sliding right. */
@Component({
  selector: 'app-toggle-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      role="switch"
      class="switch"
      [class.switch--on]="checked()"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      (click)="onClick($event)"
    >
      <span class="switch__knob"></span>
    </button>
  `,
  styles: `
    .switch {
      display: flex;
      align-items: center;
      width: 86px;
      height: 48px;
      padding: 0 5px;
      border-radius: 28px;
      background: var(--surface-2);
      transition: background 0.2s;
      flex: none;
    }

    .switch--on {
      background: var(--warm-track);
    }

    .switch__knob {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--knob-off);
      transition:
        transform 0.2s,
        background 0.2s;
    }

    .switch--on .switch__knob {
      transform: translateX(38px);
      background: var(--bg);
    }
  `,
})
export class ToggleSwitch {
  readonly checked = input.required<boolean>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly toggled = output<void>();

  protected onClick(event: Event): void {
    // Tiles are clickable too; the switch must not open the tile behind it.
    event.stopPropagation();
    this.toggled.emit();
  }
}
