import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DialogService } from '../../core/dialog/dialog';
import { HomeStore } from '../../core/home-store/home-store';
import { Modal } from '../../shared/modal/modal';

/** "Flyt til andet rum": tap the room and the device moves. */
@Component({
  selector: 'app-move-device-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  template: `
    <app-modal [label]="device()?.name ?? ''" (closed)="close()">
      <h2 class="modal__title" i18n="@@moveDevice.title">Flyt {{ device()?.name }} til</h2>
      @if (otherRooms().length === 0) {
        <p class="modal__text" i18n="@@moveDevice.noOtherRooms">
          Der er ingen andre rum endnu. Opret et rum først.
        </p>
        <div class="modal__actions">
          <button type="button" class="btn btn--primary grow" (click)="createRoom()">
            <ng-container i18n="@@createRoom.title">Opret rum</ng-container>
          </button>
          <button type="button" class="btn btn--ghost" (click)="close()" i18n="@@dialog.cancel">
            Fortryd
          </button>
        </div>
      } @else {
        <div class="rooms">
          @for (room of otherRooms(); track room.id) {
            <button type="button" class="room-option" (click)="moveTo(room.id)">
              {{ room.name }}
            </button>
          }
        </div>
        <div class="modal__actions">
          <button
            type="button"
            class="btn btn--ghost grow"
            (click)="close()"
            i18n="@@dialog.cancel"
          >
            Fortryd
          </button>
        </div>
      }
    </app-modal>
  `,
  styles: `
    .rooms {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .room-option {
      border-radius: var(--radius-control);
      background: var(--surface-2);
      padding: 18px 22px;
      font-size: 18px;
      font-weight: 600;
      line-height: 1;
      color: var(--text);
    }

    .room-option:hover {
      background: var(--warm-bg);
      color: var(--warm-text);
    }
  `,
})
export class MoveDeviceDialog {
  readonly deviceId = input.required<string>();

  private readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);

  protected readonly device = computed(() => this.store.deviceById(this.deviceId()));

  protected readonly otherRooms = computed(() => {
    const device = this.device();
    return this.store.rooms().filter((room) => room.id !== device?.roomId);
  });

  protected moveTo(roomId: string): void {
    const device = this.device();
    const room = this.store.roomById(roomId);
    if (!device || !room) {
      return;
    }
    this.store.moveDevice(device.id, roomId);
    this.store.showToast({
      message: $localize`:toast after moving a device to another room@@moveDevice.moved:${device.name}:name: er flyttet til ${room.name}:room:`,
      variant: 'neutral',
    });
    this.dialogs.close();
  }

  protected createRoom(): void {
    this.dialogs.open({ kind: 'create-room' });
  }

  protected close(): void {
    this.dialogs.close();
  }
}
