import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DialogService } from '../../../core/dialog/dialog';
import { HomeStore } from '../../../core/home-store/home-store';
import {
  Device,
  HumiditySensorDevice,
  LampDevice,
  Room,
  ThermometerDevice,
} from '../../../core/models';
import { EmptyState } from '../../../shared/empty-state/empty-state';
import { LoadState } from '../../../shared/load-state/load-state';
import { roomMeasurement } from '../../../shared/room-format/room-format';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';

interface RoomTileVm {
  readonly room: Room;
  /** Temperature if the room has a thermometer, otherwise humidity. */
  readonly reading: string;
  readonly meta: string;
}

interface AlertTileVm {
  readonly device: Device;
  readonly roomName: string;
}

/** "At most six tiles per screen" — the home screen never shows more than this. */
const MAX_TILES = 6;

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ToggleSwitch, EmptyState, LoadState],
  templateUrl: './home-page.html',
  styles: `
    /* Sits right below the headline — not pushed to the bottom like .tile__meta. */
    .lead {
      font-size: 17px;
      font-weight: 500;
      line-height: 1.45;
      color: var(--text-2);
      max-width: 36ch;
    }
  `,
})
export class HomePage {
  protected readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);

  protected readonly anyLampOn = computed(() => this.store.lampsOnCount() > 0);

  /** The rooms exist, but not a single device has been registered yet. */
  protected readonly noDevices = computed(() => this.store.devices().length === 0);

  /**
   * The light tile is about lamps — with no lamps in the house, "Alt lys er
   * slukket" would be a claim about something the system knows nothing about.
   */
  protected readonly anyLamps = computed(() =>
    this.store.devices().some((device) => device.kind === 'lamp'),
  );

  /** The rooms standing ready while there are still no devices: "Stue · Køkken". */
  protected readonly roomNames = computed(() =>
    this.store
      .rooms()
      .map((room) => room.name)
      .join(' · '),
  );

  protected readonly roomsReadyHeadline = computed(() => {
    const count = this.store.rooms().length;
    return count === 1
      ? $localize`:home tile; the one room that is ready for devices@@home.oneRoomReady:1 rum er klar`
      : $localize`:home tile; rooms ready for devices@@home.roomsReady:${count}:count: rum er klar`;
  });

  /** Last resort: devices exist, but none of them can fill a tile. */
  protected readonly showQuietTile = computed(
    () =>
      !this.noDevices() &&
      !this.anyLamps() &&
      this.roomTiles().length === 0 &&
      this.alertTiles().length === 0,
  );

  protected readonly quietSummary = computed(() => {
    const devices = this.store.devices().length;
    return devices === 1
      ? $localize`:home tile; how much the house contains@@home.quietOneDevice:1 enhed i huset`
      : $localize`:home tile; how much the house contains@@home.quietDevices:${devices}:count: enheder i huset`;
  });

  protected readonly lightHeadline = computed(() => {
    const count = this.store.lampsOnCount();
    if (count === 0) {
      return $localize`:home light tile when everything is off@@home.allLightsOff:Alt lys er slukket`;
    }
    return count === 1
      ? $localize`:home light tile; one lamp on@@home.oneLampOn:1 lampe er tændt`
      : $localize`:home light tile; several lamps on@@home.lampsOn:${count}:count: lamper er tændt`;
  });

  protected readonly allLampsToggleLabel = computed(() =>
    this.anyLampOn()
      ? $localize`:aria label for the all-lamps switch@@home.switchAllOff:Sluk alle lamper`
      : $localize`:aria label for the all-lamps switch@@home.switchAllOn:Tænd alle lamper`,
  );

  /** Space reserved for the light tile — it only shows when there are lamps. */
  private readonly reservedTiles = computed(() => (this.anyLamps() ? 1 : 0));

  /** Alerts come first, but even they respect the six-tile cap. */
  protected readonly alertTiles = computed<readonly AlertTileVm[]>(() =>
    this.store
      .offlineDevices()
      .slice(0, MAX_TILES - this.reservedTiles())
      .map((device) => ({
        device,
        roomName:
          this.store.roomById(device.roomId)?.name ??
          $localize`:fallback room name@@common.unknownRoom:Ukendt rum`,
      })),
  );

  /**
   * One tile per room that measures something, capped so the screen stays at six
   * tiles. Both temperature AND humidity count, so a bathroom with only a
   * humidity sensor still gets a tile of its own.
   */
  protected readonly roomTiles = computed<readonly RoomTileVm[]>(() => {
    const maxRoomTiles = Math.max(0, MAX_TILES - this.reservedTiles() - this.alertTiles().length);
    const tiles: RoomTileVm[] = [];
    for (const room of this.store.rooms()) {
      const devices = this.store.devicesInRoom(room.id);
      const reading = roomMeasurement(devices);
      if (reading === null) {
        continue;
      }
      tiles.push({ room, reading, meta: roomMeta(devices, reading) });
    }
    return tiles.slice(0, maxRoomTiles);
  });

  protected toggleAllLamps(): void {
    this.store.setAllLamps(!this.anyLampOn());
  }

  protected reload(): void {
    void this.store.load();
  }

  protected openAlert(deviceId: string): void {
    this.dialogs.open({ kind: 'device-detail', deviceId });
  }

  protected openCreateRoom(): void {
    this.dialogs.open({ kind: 'create-room' });
  }

  protected openAddDevice(): void {
    this.dialogs.open({ kind: 'add-device' });
  }
}

function roomMeta(devices: readonly Device[], reading: string): string {
  // Humidity is only an extra line when the big number IS the temperature.
  const humidity = devices.find(
    (device): device is ThermometerDevice | HumiditySensorDevice =>
      device.online &&
      (device.kind === 'thermometer' || device.kind === 'humidity') &&
      device.humidity !== null,
  );
  if (reading.endsWith('°') && humidity?.humidity != null) {
    return $localize`:humidity line on a home room tile@@home.humidityMeta:${humidity.humidity}:value: % luftfugtighed`;
  }
  const lamps = devices.filter(
    (device): device is LampDevice => device.kind === 'lamp' && device.online,
  );
  if (lamps.length > 0) {
    return lamps.some((lamp) => lamp.on)
      ? $localize`:light status line on a home room tile@@home.lightIsOn:Lyset er tændt`
      : $localize`:light status line on a home room tile@@home.lightIsOff:Lyset er slukket`;
  }
  return devices.length === 1
    ? $localize`:room with one device@@room.deviceCountOne:1 enhed`
    : $localize`:room with several devices@@room.deviceCountMany:${devices.length}:count: enheder`;
}
