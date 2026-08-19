import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DialogService } from '../../../core/dialog/dialog';
import { HomeStore } from '../../../core/home-store/home-store';
import { Room } from '../../../core/models';
import { deviceCountLabel } from '../../../shared/device-format/device-format';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { LoadState } from '../../../shared/load-state/load-state';
import { offlineCountLabel, roomReading } from '../../../shared/room-format/room-format';

interface RoomRowVm {
  readonly room: Room;
  readonly reading: string;
  readonly countLabel: string;
  readonly warm: boolean;
  readonly alert: boolean;
}

@Component({
  selector: 'app-rooms-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EmptyState, LoadState],
  templateUrl: './rooms-page.html',
  styles: `
    .create-tile {
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--text-3);
    }

    .create-tile:hover {
      color: var(--text);
    }

    .create-tile__plus {
      font-size: 34px;
      font-weight: 700;
      line-height: 1;
    }

    .create-tile__text {
      font-size: 18px;
      font-weight: 600;
      line-height: 1;
    }
  `,
})
export class RoomsPage {
  protected readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);

  protected readonly rows = computed<readonly RoomRowVm[]>(() =>
    this.store.rooms().map((room) => {
      const devices = this.store.devicesInRoom(room.id);
      const { reading, warm, alert, offlineCount } = roomReading(devices);
      return {
        room,
        reading,
        warm,
        alert,
        // One dead thermometer must not make the room look mute: the number
        // stays, and the meta line says what is missing.
        countLabel:
          offlineCount > 0
            ? `${deviceCountLabel(devices.length)} · ${offlineCountLabel(offlineCount)}`
            : deviceCountLabel(devices.length),
      };
    }),
  );

  protected reload(): void {
    void this.store.load();
  }

  protected openCreateRoom(): void {
    this.dialogs.open({ kind: 'create-room' });
  }
}
