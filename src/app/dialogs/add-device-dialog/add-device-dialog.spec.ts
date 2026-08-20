import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SmartHomeApi } from '../../core/api/smart-home-api';
import { DeviceDiscoveryService, DiscoveryResult } from '../../core/discovery/discovery';
import { DialogService } from '../../core/dialog/dialog';
import { DiscoveredDevice } from '../../core/models';
import { SmartHomeApiStub } from '../../testing/api-stub';
import { AddDeviceDialog, SETUP_STEP_MS } from './add-device-dialog';

function found(ssid: string, mac: string, signalStrength: number): DiscoveredDevice {
  return { ssid, mac, signalStrength };
}

/** Answers immediately, with no delay and no randomness. */
class DiscoveryStub {
  calls = 0;
  result: DiscoveryResult = {
    status: 'found',
    devices: [found('SmartHome-5A7C', 'A4:CF:12:AA:01:02', -42)],
  };

  discoverDevices(): Promise<DiscoveryResult> {
    this.calls++;
    return Promise.resolve(this.result);
  }
}

describe('AddDeviceDialog', () => {
  let api: SmartHomeApiStub;
  let discovery: DiscoveryStub;

  async function render(): Promise<ComponentFixture<AddDeviceDialog>> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SmartHomeApi, useValue: api },
        { provide: DeviceDiscoveryService, useValue: discovery },
        // Real stepping, no waiting.
        { provide: SETUP_STEP_MS, useValue: 1 },
      ],
    });
    const fixture = TestBed.createComponent(AddDeviceDialog);
    await fixture.whenStable();
    return fixture;
  }

  function text(fixture: ComponentFixture<AddDeviceDialog>): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  beforeEach(() => {
    api = new SmartHomeApiStub();
    discovery = new DiscoveryStub();
  });

  it('lists what the scan found: name and MAC address', async () => {
    const fixture = await render();
    expect(text(fixture)).toContain('A4:CF:12:AA:01:02');
    expect(text(fixture)).toContain('-42 dBm');
  });

  it('drops the SmartHome- prefix: every row would start with it otherwise', async () => {
    discovery.result = {
      status: 'found',
      devices: [found('SmartHome-TemperatureSensor', 'AA:BB:CC:00:00:01', -35)],
    };
    const fixture = await render();
    const name = (fixture.nativeElement as HTMLElement).querySelector('.found-card__name');
    expect(name?.textContent?.trim()).toBe('TemperatureSensor');
  });

  it('keeps the name when the prefix is all there is', async () => {
    discovery.result = {
      status: 'found',
      devices: [found('SmartHome', 'AA:BB:CC:00:00:01', -35)],
    };
    const fixture = await render();
    // Stripping would leave a blank row, which tells the user nothing.
    const name = (fixture.nativeElement as HTMLElement).querySelector('.found-card__name');
    expect(name?.textContent?.trim()).toBe('SmartHome');
  });

  it('puts the strongest signal first — that is the device in your hand', async () => {
    discovery.result = {
      status: 'found',
      devices: [
        found('SmartHome-Langt-Vaek', 'AA:BB:CC:00:00:01', -84),
        found('SmartHome-Taet-Paa', 'AA:BB:CC:00:00:02', -38),
        found('SmartHome-Midt', 'AA:BB:CC:00:00:03', -66),
      ],
    };
    const fixture = await render();
    const names = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.found-card__name'),
    ).map((element) => element.textContent?.trim());
    expect(names).toEqual(['Taet-Paa', 'Midt', 'Langt-Vaek']);
  });

  it('turns dBm into words, because -84 means nothing to most people', async () => {
    discovery.result = {
      status: 'found',
      devices: [
        found('SmartHome-A', 'AA:BB:CC:00:00:01', -38),
        found('SmartHome-B', 'AA:BB:CC:00:00:02', -70),
        found('SmartHome-C', 'AA:BB:CC:00:00:03', -84),
      ],
    };
    const fixture = await render();
    const body = text(fixture);
    expect(body).toContain('Godt signal');
    expect(body).toContain('Middel signal');
    expect(body).toContain('Svagt signal');
  });

  it('says "én ny enhed" for a single find', async () => {
    const fixture = await render();
    expect(text(fixture)).toContain('én ny enhed');
  });

  it('counts the finds when there are several', async () => {
    discovery.result = {
      status: 'found',
      devices: [
        found('SmartHome-A', 'AA:BB:CC:00:00:01', -38),
        found('SmartHome-B', 'AA:BB:CC:00:00:02', -70),
      ],
    };
    const fixture = await render();
    expect(text(fixture)).toContain('2 nye enheder');
  });

  it('says the air was empty when it was', async () => {
    discovery.result = { status: 'none' };
    const fixture = await render();
    expect(text(fixture)).toContain('ingen nye enheder');
    expect((fixture.nativeElement as HTMLElement).querySelector('.found-card')).toBeNull();
  });

  it('distinguishes "could not ask" from "nothing there"', async () => {
    discovery.result = { status: 'unavailable' };
    const fixture = await render();
    // An empty list here would read as "your home has no new devices", which is
    // a different and possibly false claim.
    expect(text(fixture)).toContain('kunne ikke spørge hjemmet');
    expect(text(fixture)).not.toContain('ingen nye enheder');
  });

  it('asks for nothing on the list — no name, no room, no form', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('select')).toBeNull();
  });

  describe('the pretend setup screen', () => {
    async function openFirst(): Promise<ComponentFixture<AddDeviceDialog>> {
      const fixture = await render();
      host(fixture).querySelector<HTMLElement>('.found-card')?.click();
      await fixture.whenStable();
      return fixture;
    }

    it('opens when a row is clicked, showing the full ssid and MAC', async () => {
      const fixture = await openFirst();
      expect(text(fixture)).toContain('SmartHome-5A7C');
      expect(text(fixture)).toContain('A4:CF:12:AA:01:02');
      expect(host(fixture).querySelector('.steps')).not.toBeNull();
    });

    it('says it is a mockup, both while running and when it finishes', async () => {
      const fixture = await openFirst();
      expect(text(fixture)).toContain('Attrap');
      expect(text(fixture)).toContain('bliver ikke sendt noget til enheden');

      await new Promise((resolve) => setTimeout(resolve, 40));
      await fixture.whenStable();

      // Never claims the device was set up.
      expect(text(fixture)).toContain('ikke sendt noget til enheden');
      expect(text(fixture)).not.toContain('Enheden er sat op');
    });

    it('walks through every step', async () => {
      const fixture = await openFirst();
      await new Promise((resolve) => setTimeout(resolve, 40));
      await fixture.whenStable();
      const done = host(fixture).querySelectorAll('.steps__item--done').length;
      expect(done).toBe(host(fixture).querySelectorAll('.steps__item').length);
    });

    it('goes back to the list', async () => {
      const fixture = await openFirst();
      const back = Array.from(host(fixture).querySelectorAll<HTMLElement>('button')).find(
        (button) => (button.textContent ?? '').includes('Tilbage'),
      );
      back?.click();
      await fixture.whenStable();
      expect(host(fixture).querySelector('.found-card')).not.toBeNull();
      expect(host(fixture).querySelector('.steps')).toBeNull();
    });
  });

  it('scans again on demand', async () => {
    const fixture = await render();
    expect(discovery.calls).toBe(1);

    const again = Array.from(host(fixture).querySelectorAll<HTMLElement>('button')).find((button) =>
      (button.textContent ?? '').includes('Søg igen'),
    );
    again?.click();
    await fixture.whenStable();
    expect(discovery.calls).toBe(2);
  });

  it('closes', async () => {
    const fixture = await render();
    const close = Array.from(host(fixture).querySelectorAll<HTMLElement>('button')).find((button) =>
      (button.textContent ?? '').includes('Luk'),
    );
    close?.click();
    await fixture.whenStable();
    expect(TestBed.inject(DialogService).active()).toBeNull();
  });

  function host(fixture: ComponentFixture<AddDeviceDialog>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
});
