import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ClockService } from '../../../core/clock/clock';
import { DialogService } from '../../../core/dialog/dialog';
import { HomeStore } from '../../../core/home-store/home-store';
import { Device } from '../../../core/models';
import { deviceStatusText } from '../../../shared/device-format/device-format';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { LoadState } from '../../../shared/load-state/load-state';
import { LongPressDirective } from '../../../shared/long-press/long-press';

interface DeviceRowVm {
  readonly device: Device;
  readonly roomName: string;
  readonly status: string;
  readonly warm: boolean;
}

@Component({
  selector: 'app-devices-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyState, LoadState, LongPressDirective],
  templateUrl: './devices-page.html',
})
export class DevicesPage {
  protected readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);
  private readonly clock = inject(ClockService);

  protected readonly rows = computed<readonly DeviceRowVm[]>(() => {
    const now = this.clock.now();
    const pending = this.store.pendingSwitch();
    return this.store
      .devices()
      .map((device) => ({
        device,
        roomName:
          this.store.roomById(device.roomId)?.name ??
          $localize`:fallback room name@@common.unknownRoom:Ukendt rum`,
        status: deviceStatusText(device, pending.get(device.id), now),
        warm: device.kind === 'lamp' && device.on && device.online,
      }))
      .sort(
        (a, b) =>
          a.roomName.localeCompare(b.roomName, 'da') ||
          a.device.name.localeCompare(b.device.name, 'da'),
      );
  });

  protected reload(): void {
    void this.store.load();
  }

  protected openDetail(deviceId: string): void {
    this.dialogs.open({ kind: 'device-detail', deviceId });
  }

  protected openMenu(deviceId: string): void {
    this.dialogs.open({ kind: 'device-menu', deviceId });
  }

  protected openAddDevice(): void {
    this.dialogs.open({ kind: 'add-device' });
  }

  protected openCreateRoom(): void {
    this.dialogs.open({ kind: 'create-room' });
  }
}
