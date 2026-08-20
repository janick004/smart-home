import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DeviceDiscoveryService } from '../../core/discovery/discovery';
import { DialogService } from '../../core/dialog/dialog';
import { DiscoveredDevice } from '../../core/models';
import { Modal } from '../../shared/modal/modal';

/**
 * 'searching' is asking the hub, 'found' lists what its radio can see, 'none'
 * means the scan came back empty, and 'unavailable' means the hub could not be
 * asked at all.
 */
type SearchPhase = 'searching' | 'found' | 'none' | 'unavailable';

/**
 * "Tilføj enhed": shows what `GET /devices/discovered` reports — the access
 * points the hub's wifi scan can see, filtered server-side to names starting
 * with "SmartHome".
 *
 * Showing the list is the whole job for now. There is deliberately no name, no
 * room and no "add" button: a device broadcasting its own access point is not on
 * the home network, so there is nothing to register it against yet.
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
      /* Modalen er selv en flex-container: uden dette bliver listen klemt i
         stedet for at fylde, og de nederste rækker forsvinder uden scrollbar. */
      flex: none;
    }

    .found-card {
      flex: none;
      border-radius: var(--radius-inner);
      background: var(--surface-2);
      padding: 16px 22px;
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
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
      overflow-wrap: anywhere;
    }

    .found-card__meta {
      font-size: 15px;
      font-weight: 500;
      line-height: 1.3;
      color: var(--text-3);
      overflow-wrap: anywhere;
    }

    .found-card__signal {
      flex: none;
      text-align: right;
      font-size: 15px;
      font-weight: 500;
      color: var(--text-3);
      white-space: nowrap;
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
  private readonly discovery = inject(DeviceDiscoveryService);
  private readonly dialogs = inject(DialogService);

  protected readonly phase = signal<SearchPhase>('searching');
  protected readonly devices = signal<readonly DiscoveredDevice[]>([]);

  constructor() {
    this.search();
  }

  /** "-48 dBm" means little to most people; strong/medium/weak does. */
  protected signalLabel(dbm: number): string {
    if (dbm >= -60) {
      return $localize`:wifi signal strength@@addDevice.signalStrong:Godt signal`;
    }
    if (dbm >= -75) {
      return $localize`:wifi signal strength@@addDevice.signalOk:Middel signal`;
    }
    return $localize`:wifi signal strength@@addDevice.signalWeak:Svagt signal`;
  }

  protected search(): void {
    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    this.phase.set('searching');
    this.devices.set([]);
    const result = await this.discovery.discoverDevices();
    if (result.status === 'found') {
      // Strongest first: the device in your hand is the one you mean.
      this.devices.set([...result.devices].sort((a, b) => b.signalStrength - a.signalStrength));
      this.phase.set('found');
      return;
    }
    this.phase.set(result.status === 'none' ? 'none' : 'unavailable');
  }

  protected close(): void {
    this.dialogs.close();
  }
}
