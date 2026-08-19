import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { parseApiDate } from '../../core/api/mapping';
import { SmartHomeApi } from '../../core/api/smart-home-api';
import { ClockService } from '../../core/clock/clock';
import { DialogService } from '../../core/dialog/dialog';
import { HomeStore } from '../../core/home-store/home-store';
import { HistoryPoint, LampDevice, MotionSensorDevice } from '../../core/models';
import {
  lampStateText,
  lampToggleLabel,
  lastMotionLabel,
  motionHeadline,
} from '../../shared/device-format/device-format';
import { exactTimeLabel, relativeTimeLabel } from '../../shared/relative-time/relative-time';
import { Modal } from '../../shared/modal/modal';
import { ToggleSwitch } from '../../shared/toggle-switch/toggle-switch';

type PingState = 'idle' | 'pinging' | 'failed';

const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 64;

/**
 * Device drill-in (mockup 05): the reading in human words, time in human words
 * with the precise moment on hover, and the technical details folded away.
 * For a device that does not answer it becomes the help-first troubleshooter.
 */
@Component({
  selector: 'app-device-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, ToggleSwitch],
  templateUrl: './device-detail-dialog.html',
  styles: `
    .reading {
      font-size: 38px;
      font-weight: 700;
      line-height: 1.05;
      color: var(--text);
    }

    .reading--num {
      font-size: 46px;
      font-variant-numeric: tabular-nums;
    }

    .updated {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      line-height: 1;
      color: var(--text-2);
      cursor: default;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .step {
      padding: 16px 4px;
      border-top: 1px solid var(--surface-2);
      font-size: 17px;
      font-weight: 500;
      line-height: 1.35;
      color: var(--text-2);
    }

    .spark {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .spark__label {
      font-size: 15px;
      font-weight: 600;
      line-height: 1;
      color: var(--text-3);
    }

    .spark__empty {
      font-size: 17px;
      font-weight: 500;
      line-height: 1.4;
      color: var(--text-2);
    }

    .spark__svg {
      width: 100%;
      height: 64px;
      color: var(--text-3);
    }

    .tech {
      border-radius: var(--radius-inner);
      background: var(--surface-2);
      padding: 22px 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .tech__head {
      display: flex;
      align-items: center;
      width: 100%;
      font-size: 17px;
      font-weight: 600;
      line-height: 1;
      color: var(--text);
    }

    .tech__head > span:first-child {
      flex: 1;
    }

    .tech__head > span:last-child {
      color: var(--text-2);
    }

    .tech__grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px 22px;
      font-size: 15px;
      font-weight: 500;
      line-height: 1.4;
      color: var(--text-2);
      overflow-wrap: anywhere;
    }

    .tech__key {
      color: var(--text-3);
    }
  `,
})
export class DeviceDetailDialog {
  readonly deviceId = input.required<string>();

  private readonly store = inject(HomeStore);
  private readonly api = inject(SmartHomeApi);
  private readonly dialogs = inject(DialogService);
  private readonly clock = inject(ClockService);

  protected readonly device = computed(() => this.store.deviceById(this.deviceId()));

  protected readonly roomName = computed(() => {
    const device = this.device();
    return device ? (this.store.roomById(device.roomId)?.name ?? '') : '';
  });

  protected readonly expanded = signal(false);
  protected readonly pingState = signal<PingState>('idle');
  protected readonly history = signal<readonly HistoryPoint[]>([]);

  /** Shown where a technical field has not yet been fetched from the API's detail endpoint. */
  protected readonly unknownValue = '—';

  private historySeq = 0;
  private lastHistoryDeviceId: string | null = null;
  private detailLoadedFor: string | null = null;

  /** Which device (if any) should have its 24h history loaded. */
  private readonly historyDeviceId = computed(() => {
    const device = this.device();
    return device && device.online && (device.kind === 'thermometer' || device.kind === 'humidity')
      ? device.id
      : null;
  });

  constructor() {
    // The list behind the store has no MAC/IP/registration date; the detail response does.
    effect(() => {
      const id = this.deviceId();
      if (id === this.detailLoadedFor) {
        return;
      }
      this.detailLoadedFor = id;
      void this.store.refreshDevice(id);
    });
    effect(() => {
      const id = this.historyDeviceId();
      if (id === this.lastHistoryDeviceId) {
        return; // same device, already loaded — do not refetch on unrelated updates
      }
      this.lastHistoryDeviceId = id;
      if (id === null) {
        this.history.set([]);
        return;
      }
      void this.loadHistory(id);
    });
  }

  private async loadHistory(deviceId: string): Promise<void> {
    const seq = ++this.historySeq;
    const sensorType = this.device()?.kind === 'humidity' ? 'humidity' : 'temperature';
    try {
      // The API answers with a flat list of samples (not series) — filtered by
      // sensor type server-side and sorted oldest first.
      const samples = await this.api.getDeviceHistory(deviceId, { range: '24h', sensorType });
      if (seq !== this.historySeq) {
        return; // a newer request superseded this one
      }
      this.history.set(
        samples.map((sample) => ({
          at: parseApiDate(sample.timestamp),
          value: sample.value,
        })),
      );
    } catch (error) {
      console.error('Loading device history failed', deviceId, error);
      if (seq === this.historySeq) {
        this.history.set([]);
      }
    }
  }

  /**
   * True for a sensor that SHOULD have a curve. Used to explain an empty chart
   * ("not enough readings yet") instead of letting the whole section disappear,
   * as if the app had forgotten about it.
   */
  protected readonly expectsHistory = computed(() => this.historyDeviceId() !== null);

  /** Polyline points for the 24-hour curve; empty when there is nothing to draw. */
  protected readonly sparkPoints = computed(() => {
    const points = this.history();
    if (points.length < 2) {
      return '';
    }
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * SPARK_WIDTH;
        const y = 6 + (1 - (point.value - min) / range) * (SPARK_HEIGHT - 12);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  protected lampState(device: LampDevice): string {
    return lampStateText(device.on, this.store.pendingSwitch().get(device.id));
  }

  protected toggleLabel(name: string): string {
    return lampToggleLabel(name);
  }

  protected motionState(device: MotionSensorDevice): string {
    return motionHeadline(device, this.clock.now());
  }

  protected lastMotionText(device: MotionSensorDevice): string {
    return device.lastMotionAt !== null
      ? $localize`:when the sensor last saw motion@@device.lastMotion:Sidste bevægelse ${lastMotionLabel(device.lastMotionAt, this.clock.now())}:time:`
      : '';
  }

  protected updatedRelative(value: Date): string {
    return relativeTimeLabel(value, this.clock.now());
  }

  protected updatedExact(value: Date): string {
    return exactTimeLabel(value, this.clock.now());
  }

  protected toggleLamp(deviceId: string): void {
    this.store.toggleLamp(deviceId);
  }

  protected toggleExpanded(): void {
    this.expanded.update((expanded) => !expanded);
  }

  protected tryFindAgain(): void {
    void this.runPing();
  }

  /** The API has no ping endpoint — re-fetching the device is the honest stand-in. */
  private async runPing(): Promise<void> {
    const device = this.device();
    if (!device || this.pingState() === 'pinging') {
      return;
    }
    this.pingState.set('pinging');
    const refreshed = await this.store.refreshDevice(device.id);
    if (refreshed?.online) {
      this.store.showToast({
        message: $localize`:toast when an offline device answers again@@device.respondsAgain:${device.name}:name: svarer igen`,
        variant: 'neutral',
      });
      this.pingState.set('idle');
      // The user may have dismissed this dialog and opened another while the
      // refresh was in flight — only close if this dialog is still the active one.
      const active = this.dialogs.active();
      if (active?.kind === 'device-detail' && active.deviceId === device.id) {
        this.dialogs.close();
      }
    } else {
      this.pingState.set('failed');
    }
  }

  protected close(): void {
    this.dialogs.close();
  }
}
