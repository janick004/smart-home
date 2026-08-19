import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DeviceDiscoveryService } from '../../core/discovery/discovery';
import { DialogService } from '../../core/dialog/dialog';
import { HomeStore } from '../../core/home-store/home-store';
import { DeviceKind, DiscoveredDevice } from '../../core/models';
import { DEVICE_KINDS, deviceKindLabel } from '../../shared/device-format/device-format';
import { Modal } from '../../shared/modal/modal';

/**
 * 'searching' asks the hub, 'found' lists what is on the network, 'none' means
 * the hub answered with an empty list, and 'unavailable' means it could not be
 * asked at all (today: the endpoint does not exist yet).
 */
type SearchPhase = 'searching' | 'found' | 'none' | 'unavailable';

/**
 * "Tilføj enhed" (mockup 04): the hub is asked which devices are on the network
 * but not registered, you pick one, name it and place it in a room. The chosen
 * device is registered through POST /devices on its MAC address.
 */
@Component({
  selector: 'app-add-device-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  templateUrl: './add-device-dialog.html',
  styles: `
    .found-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .found-card {
      border-radius: var(--radius-inner);
      background: var(--surface-2);
      padding: 18px 22px;
      display: flex;
      align-items: center;
      gap: 16px;
      text-align: left;
      width: 100%;
    }

    .found-card--selected {
      background: var(--warm-bg);
    }

    .found-card__text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .found-card__name {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.1;
      color: var(--text);
    }

    .found-card--selected .found-card__name {
      color: var(--warm-text);
    }

    .found-card__meta {
      font-size: 15px;
      font-weight: 500;
      line-height: 1.3;
      color: var(--text-3);
      overflow-wrap: anywhere;
    }

    .found-card--selected .found-card__meta {
      color: var(--warm-label);
    }

    .found-card__badge {
      flex: none;
      font-size: 17px;
      font-weight: 600;
      line-height: 1;
      color: var(--warm-label);
    }

    .searching {
      display: flex;
      align-items: center;
      gap: 14px;
      color: var(--text-2);
    }

    .searching__pulse {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--text-3);
      animation: pulse 1.1s ease-in-out infinite;
      flex: none;
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 0.35;
        transform: scale(0.8);
      }

      50% {
        opacity: 1;
        transform: scale(1.1);
      }
    }
  `,
})
export class AddDeviceDialog {
  protected readonly store = inject(HomeStore);
  private readonly discovery = inject(DeviceDiscoveryService);
  private readonly dialogs = inject(DialogService);

  protected readonly kinds = DEVICE_KINDS;

  protected readonly phase = signal<SearchPhase>('searching');
  protected readonly devices = signal<readonly DiscoveredDevice[]>([]);
  protected readonly selectedMac = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly roomId = signal('');
  protected readonly kind = signal<DeviceKind | ''>('');
  protected readonly submitting = signal(false);

  protected readonly selected = computed(
    () => this.devices().find((device) => device.mac === this.selectedMac()) ?? null,
  );

  protected readonly canSubmit = computed(
    () =>
      this.selected() !== null &&
      this.name().trim() !== '' &&
      this.roomId() !== '' &&
      this.kind() !== '' &&
      !this.submitting(),
  );

  constructor() {
    this.search();
  }

  protected kindLabel(kind: DeviceKind): string {
    return deviceKindLabel(kind);
  }

  /** "AA:BB:CC:DD:EE:FF · 192.168.1.77" — what identifies the find on the network. */
  protected deviceMeta(device: DiscoveredDevice): string {
    return device.ip === null ? device.mac : `${device.mac} · ${device.ip}`;
  }

  /** A find that announced neither a name nor a type still needs a card title. */
  protected deviceTitle(device: DiscoveredDevice): string {
    if (device.suggestedName !== '') {
      return device.suggestedName;
    }
    return device.kind === null
      ? $localize`:card title for a find with no name and no type@@addDevice.unknownDevice:Ukendt enhed`
      : deviceKindLabel(device.kind);
  }

  protected search(): void {
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    this.phase.set('searching');
    this.devices.set([]);
    this.selectedMac.set(null);
    const result = await this.discovery.discoverDevices();
    if (result.status === 'found') {
      this.devices.set(result.devices);
      this.phase.set('found');
      // One find is the common case: no reason to make the user pick from a list of one.
      if (result.devices.length === 1) {
        this.select(result.devices[0].mac);
      }
      return;
    }
    this.phase.set(result.status === 'none' ? 'none' : 'unavailable');
  }

  /** Picking a device prefills whatever the hub could tell us about it. */
  protected select(mac: string): void {
    if (this.selectedMac() === mac) {
      return;
    }
    this.selectedMac.set(mac);
    const device = this.devices().find((d) => d.mac === mac);
    this.name.set(device?.suggestedName ?? '');
    this.kind.set(device?.kind ?? '');
  }

  protected onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onRoomChange(event: Event): void {
    this.roomId.set((event.target as HTMLSelectElement).value);
  }

  protected onKindChange(event: Event): void {
    this.kind.set((event.target as HTMLSelectElement).value as DeviceKind | '');
  }

  /** From "you have no rooms yet" straight on to creating one. */
  protected openCreateRoom(): void {
    this.dialogs.open({ kind: 'create-room' });
  }

  protected submit(): void {
    void this.runSubmit();
  }

  private async runSubmit(): Promise<void> {
    const device = this.selected();
    const kind = this.kind();
    if (device === null || kind === '' || !this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    const added = await this.store.addDevice({
      name: this.name(),
      roomId: this.roomId(),
      kind,
      mac: device.mac,
      ...(device.ip !== null ? { ip: device.ip } : {}),
    });
    this.submitting.set(false);
    if (added !== null) {
      const roomName = this.store.roomById(added.roomId)?.name ?? '';
      this.store.showToast({
        message: $localize`:toast after adding a device to a room@@addDevice.added:${added.name}:name: er tilføjet i ${roomName}:room:`,
        variant: 'neutral',
      });
      this.close();
    }
    // On failure the store already showed an alert toast; the dialog stays open.
  }

  protected close(): void {
    this.dialogs.close();
  }
}
