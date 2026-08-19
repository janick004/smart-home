import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogService } from '../../core/dialog/dialog';
import { HomeStore } from '../../core/home-store/home-store';
import { Modal } from '../../shared/modal/modal';

/**
 * "Slet Garage?" (mockup 04): devices are never deleted silently — you pick
 * where they go. Only when no other room exists do they follow the room,
 * and then the undo toast is the safety net.
 */
@Component({
  selector: 'app-delete-room-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  templateUrl: './delete-room-dialog.html',
  styles: `
    .move-row {
      border-radius: var(--radius-control);
      background: var(--surface-2);
      padding: 8px 8px 8px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .move-row__label {
      flex: 1;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.2;
      color: var(--text);
      white-space: nowrap;
    }

    .move-row .select-wrap {
      flex: 1;
      min-width: 0;
    }

    .move-row select.field {
      background: transparent;
      color: var(--text-3);
      padding: 14px 40px 14px 12px;
    }
  `,
})
export class DeleteRoomDialog {
  readonly roomId = input.required<string>();

  protected readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  protected readonly moveToRoomId = signal('');

  protected readonly room = computed(() => this.store.roomById(this.roomId()));

  protected readonly deviceCount = computed(() => this.store.devicesInRoom(this.roomId()).length);

  protected readonly otherRooms = computed(() =>
    this.store.rooms().filter((room) => room.id !== this.roomId()),
  );

  /** Devices exist and there is somewhere for them to go — a target is required. */
  protected readonly needsTarget = computed(
    () => this.deviceCount() > 0 && this.otherRooms().length > 0,
  );

  protected readonly canSubmit = computed(() => !this.needsTarget() || this.moveToRoomId() !== '');

  protected readonly moveLabel = computed(() => {
    const count = this.deviceCount();
    return count === 1
      ? $localize`:label before the room picker; one device@@deleteRoom.moveOne:Flyt 1 enhed til`
      : $localize`:label before the room picker; several devices@@deleteRoom.moveMany:Flyt ${count}:count: enheder til`;
  });

  protected onTargetChange(event: Event): void {
    this.moveToRoomId.set((event.target as HTMLSelectElement).value);
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const roomId = this.roomId();
    this.store.deleteRoom(roomId, this.needsTarget() ? this.moveToRoomId() : null);
    this.dialogs.close();
    if (this.router.url.startsWith(`/rum/${roomId}`)) {
      void this.router.navigate(['/rum']);
    }
  }

  protected close(): void {
    this.dialogs.close();
  }
}
