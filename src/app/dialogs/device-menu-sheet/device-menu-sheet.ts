import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DialogService } from '../../core/dialog/dialog';
import { HomeStore } from '../../core/home-store/home-store';
import { Modal } from '../../shared/modal/modal';

/** The long-press menu (mockup 04): rename, move, or remove a device. */
@Component({
  selector: 'app-device-menu-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    <app-modal [label]="device()?.name ?? ''" (closed)="close()">
      @if (device(); as device) {
        <div class="preview">
          <span class="preview__room">{{ roomName() }}</span>
          <span class="preview__name">{{ device.name }}</span>
        </div>
        <div class="items">
          <button type="button" class="menu-item" (click)="rename()" i18n="@@deviceMenu.rename">
            Omdøb
          </button>
          <button type="button" class="menu-item" (click)="move()" i18n="@@deviceMenu.move">
            Flyt til andet rum
          </button>
          <button
            type="button"
            class="menu-item menu-item--danger"
            (click)="remove()"
            i18n="@@deviceMenu.remove"
          >
            Fjern enhed
          </button>
        </div>
      }
    </app-modal>
  `,
  styles: `
    .preview {
      border-radius: var(--radius-inner);
      background: var(--surface-2);
      padding: 22px 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .preview__room {
      font-size: 15px;
      font-weight: 600;
      line-height: 1;
      color: var(--text-2);
    }

    .preview__name {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.1;
      color: var(--text);
    }

    .items {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  `,
})
export class DeviceMenuSheet {
  readonly deviceId = input.required<string>();

  private readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);

  protected readonly device = computed(() => this.store.deviceById(this.deviceId()));

  protected readonly roomName = computed(() => {
    const device = this.device();
    return device ? (this.store.roomById(device.roomId)?.name ?? '') : '';
  });

  protected rename(): void {
    this.dialogs.open({ kind: 'rename-device', deviceId: this.deviceId() });
  }

  protected move(): void {
    this.dialogs.open({ kind: 'move-device', deviceId: this.deviceId() });
  }

  protected remove(): void {
    // No confirm dialog — removal is immediate and the toast offers undo (mockup 05).
    this.store.removeDevice(this.deviceId());
    this.dialogs.close();
  }

  protected close(): void {
    this.dialogs.close();
  }
}
