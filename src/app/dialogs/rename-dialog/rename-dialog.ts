import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { DialogService } from '../../core/dialog/dialog';
import { HomeStore } from '../../core/home-store/home-store';
import { Modal } from '../../shared/modal/modal';

export interface RenameTarget {
  readonly kind: 'room' | 'device';
  readonly id: string;
}

/** Shared "Omdøb" dialog for rooms and devices. */
@Component({
  selector: 'app-rename-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    <app-modal i18n-label="@@rename.title" label="Omdøb" (closed)="close()">
      <h2 class="modal__title" i18n="@@rename.title">Omdøb</h2>
      <div class="fields">
        <input
          class="field"
          type="text"
          [placeholder]="currentName()"
          [value]="name()"
          (input)="onNameInput($event)"
        />
      </div>
      <div class="modal__actions">
        <button
          type="button"
          class="btn btn--primary grow"
          [disabled]="!canSubmit()"
          (click)="submit()"
          i18n="@@rename.submit"
        >
          Gem navn
        </button>
        <button type="button" class="btn btn--ghost" (click)="close()" i18n="@@dialog.cancel">
          Fortryd
        </button>
      </div>
    </app-modal>
  `,
})
export class RenameDialog {
  readonly target = input.required<RenameTarget>();

  private readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);

  protected readonly currentName = computed(() => {
    const target = this.target();
    return target.kind === 'room'
      ? (this.store.roomById(target.id)?.name ?? '')
      : (this.store.deviceById(target.id)?.name ?? '');
  });

  /** Starts as the current name so a small edit is one keystroke away. */
  protected readonly name = linkedSignal(() => this.currentName());

  protected readonly canSubmit = computed(() => this.name().trim() !== '');

  protected onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const target = this.target();
    if (target.kind === 'room') {
      this.store.renameRoom(target.id, this.name());
    } else {
      this.store.renameDevice(target.id, this.name());
    }
    this.close();
  }

  protected close(): void {
    this.dialogs.close();
  }
}
