import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DialogService } from '../../core/dialog/dialog';
import { AddDeviceDialog } from '../add-device-dialog/add-device-dialog';
import { CreateRoomDialog } from '../create-room-dialog/create-room-dialog';
import { DeleteRoomDialog } from '../delete-room-dialog/delete-room-dialog';
import { DeviceDetailDialog } from '../device-detail-dialog/device-detail-dialog';
import { DeviceMenuSheet } from '../device-menu-sheet/device-menu-sheet';
import { MoveDeviceDialog } from '../move-device-dialog/move-device-dialog';
import { RenameDialog, RenameTarget } from '../rename-dialog/rename-dialog';

/** Renders whichever dialog is open. Lives once, in the app shell. */
@Component({
  selector: 'app-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddDeviceDialog,
    CreateRoomDialog,
    DeleteRoomDialog,
    DeviceDetailDialog,
    DeviceMenuSheet,
    MoveDeviceDialog,
    RenameDialog,
  ],
  template: `
    @if (isAddDevice()) {
      <app-add-device-dialog />
    }
    @if (isCreateRoom()) {
      <app-create-room-dialog />
    }
    @if (renameTarget(); as target) {
      <app-rename-dialog [target]="target" />
    }
    @if (deleteRoomId(); as roomId) {
      <app-delete-room-dialog [roomId]="roomId" />
    }
    @if (deviceMenuId(); as deviceId) {
      <app-device-menu-sheet [deviceId]="deviceId" />
    }
    @if (moveDeviceId(); as deviceId) {
      <app-move-device-dialog [deviceId]="deviceId" />
    }
    @if (deviceDetailId(); as deviceId) {
      <app-device-detail-dialog [deviceId]="deviceId" />
    }
  `,
})
export class DialogHost {
  private readonly dialogs = inject(DialogService);

  protected readonly isAddDevice = computed(() => this.dialogs.active()?.kind === 'add-device');
  protected readonly isCreateRoom = computed(() => this.dialogs.active()?.kind === 'create-room');

  protected readonly renameTarget = computed<RenameTarget | null>(() => {
    const active = this.dialogs.active();
    if (active?.kind === 'rename-room') {
      return { kind: 'room', id: active.roomId };
    }
    if (active?.kind === 'rename-device') {
      return { kind: 'device', id: active.deviceId };
    }
    return null;
  });

  protected readonly deleteRoomId = computed(() => {
    const active = this.dialogs.active();
    return active?.kind === 'delete-room' ? active.roomId : null;
  });

  protected readonly deviceMenuId = computed(() => {
    const active = this.dialogs.active();
    return active?.kind === 'device-menu' ? active.deviceId : null;
  });

  protected readonly moveDeviceId = computed(() => {
    const active = this.dialogs.active();
    return active?.kind === 'move-device' ? active.deviceId : null;
  });

  protected readonly deviceDetailId = computed(() => {
    const active = this.dialogs.active();
    return active?.kind === 'device-detail' ? active.deviceId : null;
  });
}
