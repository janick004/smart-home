import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClockService } from '../../../core/clock/clock';
import { DialogService } from '../../../core/dialog/dialog';
import { HomeStore } from '../../../core/home-store/home-store';
import { DeviceKind, LampDevice, MotionSensorDevice } from '../../../core/models';
import {
  deviceCountLabel,
  lampStateText,
  lampToggleLabel,
  lastMotionLabel,
  motionHeadline,
} from '../../../shared/device-format/device-format';
import { LoadState } from '../../../shared/load-state/load-state';
import { LongPressDirective } from '../../../shared/long-press/long-press';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';

const KIND_ORDER: Record<DeviceKind, number> = { lamp: 0, thermometer: 1, humidity: 2, motion: 3 };

@Component({
  selector: 'app-room-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ToggleSwitch, LongPressDirective, LoadState],
  templateUrl: './room-detail-page.html',
  styles: `
    .room-head {
      display: flex;
      align-items: baseline;
      gap: 18px;
    }

    .room-head__back {
      font-size: 22px;
      font-weight: 600;
      line-height: 1;
      color: var(--text-3);
      text-decoration: none;
    }

    .room-head__back:hover {
      color: var(--text);
    }

    .room-head__name {
      margin: 0;
      font-size: 34px;
      font-weight: 700;
      line-height: 1;
      color: var(--text);
    }

    .room-head__count {
      font-size: 17px;
      font-weight: 500;
      color: var(--text-3);
    }

    .room-head__spacer {
      flex: 1;
    }

    .missing {
      margin: 0;
      font-size: 17px;
      font-weight: 500;
      color: var(--text-2);
    }
  `,
})
export class RoomDetailPage {
  /** Room id from the route (`/rum/:id`), bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  protected readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);
  private readonly clock = inject(ClockService);

  protected readonly room = computed(() => this.store.roomById(this.id()));

  protected readonly devices = computed(() =>
    [...this.store.devicesInRoom(this.id())].sort(
      (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'da'),
    ),
  );

  protected readonly countLabel = computed(() => deviceCountLabel(this.devices().length));

  protected lampState(device: LampDevice): string {
    return lampStateText(device.on, this.store.pendingSwitch().get(device.id));
  }

  protected toggleLabel(name: string): string {
    return lampToggleLabel(name);
  }

  protected motionState(device: MotionSensorDevice): string {
    return motionHeadline(device, this.clock.now());
  }

  protected motionTime(lastMotionAt: Date): string {
    return lastMotionLabel(lastMotionAt, this.clock.now());
  }

  protected reload(): void {
    void this.store.load();
  }

  protected toggleLamp(deviceId: string): void {
    this.store.toggleLamp(deviceId);
  }

  protected openDetail(deviceId: string): void {
    this.dialogs.open({ kind: 'device-detail', deviceId });
  }

  protected openMenu(deviceId: string): void {
    this.dialogs.open({ kind: 'device-menu', deviceId });
  }

  protected openRename(): void {
    this.dialogs.open({ kind: 'rename-room', roomId: this.id() });
  }

  protected openDelete(): void {
    this.dialogs.open({ kind: 'delete-room', roomId: this.id() });
  }

  protected openAddDevice(): void {
    this.dialogs.open({ kind: 'add-device' });
  }
}
