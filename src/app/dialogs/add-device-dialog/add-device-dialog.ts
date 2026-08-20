import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
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
 * The prefix the API filters on (`Ssid.StartsWith("SmartHome")`). It is on every
 * name in the list, so showing it just makes every row start with the same
 * eleven characters.
 */
const NAME_PREFIX = /^smarthome[-_ ]?/i;

/**
 * How long each step of the pretend setup lingers. A token so tests can run the
 * real stepping without waiting seconds for it.
 */
export const SETUP_STEP_MS = new InjectionToken<number>('SETUP_STEP_MS', {
  providedIn: 'root',
  factory: () => 900,
});

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
      text-align: left;
    }

    .found-card:hover,
    .found-card:focus-visible {
      background: var(--warm-bg);
    }

    .found-card:hover .found-card__name,
    .found-card:focus-visible .found-card__name {
      color: var(--warm-text);
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

    .steps {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }

    .steps__item {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--text-3);
      line-height: 1.4;
    }

    .steps__item--done {
      color: var(--text);
    }

    .steps__dot {
      flex: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--text-3);
      opacity: 0.4;
    }

    .steps__item--done .steps__dot {
      opacity: 1;
      background: var(--warm-label);
    }

    /* Systemets alarm-roede - samme behandling appen bruger naar noget
       kraever et ekstra blik, frem for en ny farve kun til dette. */
    .mockup {
      margin-top: 18px;
      padding: 14px 16px;
      border-radius: var(--radius-inner);
      background: var(--alert-bg);
      color: var(--alert-text);
      font-size: 15px;
      line-height: 1.5;
    }

    .mockup__tag {
      display: inline-block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--alert-strong);
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
  private readonly stepMs = inject(SETUP_STEP_MS);

  protected readonly phase = signal<SearchPhase>('searching');
  protected readonly devices = signal<readonly DiscoveredDevice[]>([]);

  /** The device whose (pretend) setup is on screen. null = showing the list. */
  protected readonly selected = signal<DiscoveredDevice | null>(null);
  /** How far the pretend setup has walked: 0..steps.length. */
  protected readonly step = signal(0);

  /**
   * What setting a device up WILL involve. Shown as a walkthrough so the screen
   * is worth looking at — but nothing here talks to the device, and the screen
   * says so. See `stepLabels`.
   */
  protected readonly steps = [1, 2, 3];

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // A dialog closed mid-walkthrough must not keep waking up.
    inject(DestroyRef).onDestroy(() => this.stopWalkthrough());
    this.search();
  }

  /**
   * `SmartHome-TemperatureSensor` reads as `TemperatureSensor`. Falls back to the
   * full name if the prefix is all there is, so a row can never end up blank.
   */
  protected displayName(device: DiscoveredDevice): string {
    const stripped = device.ssid.replace(NAME_PREFIX, '').trim();
    return stripped === '' ? device.ssid : stripped;
  }

  protected stepLabel(index: number): string {
    if (index === 1) {
      return $localize`:pretend setup step@@addDevice.step1:Sender dit wifi til enheden`;
    }
    if (index === 2) {
      return $localize`:pretend setup step@@addDevice.step2:Enheden genstarter og går på nettet`;
    }
    return $localize`:pretend setup step@@addDevice.step3:Enheden melder sig til hjemmet`;
  }

  /** Opens the pretend setup for one device. */
  protected open(device: DiscoveredDevice): void {
    this.selected.set(device);
    this.step.set(0);
    this.walk();
  }

  /** Back to the list, abandoning the walkthrough. */
  protected back(): void {
    this.stopWalkthrough();
    this.selected.set(null);
    this.step.set(0);
  }

  protected get done(): boolean {
    return this.step() >= this.steps.length;
  }

  private walk(): void {
    this.stopWalkthrough();
    if (this.done) {
      return;
    }
    this.timer = setTimeout(() => {
      this.step.update((current) => current + 1);
      this.walk();
    }, this.stepMs);
  }

  private stopWalkthrough(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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
    this.back();
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
    this.stopWalkthrough();
    this.dialogs.close();
  }
}
