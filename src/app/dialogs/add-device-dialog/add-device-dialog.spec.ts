import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SmartHomeApi } from '../../core/api/smart-home-api';
import { DeviceDiscoveryService, DiscoveryResult } from '../../core/discovery/discovery';
import { DialogService } from '../../core/dialog/dialog';
import { DiscoveredDevice } from '../../core/models';
import { SmartHomeApiStub } from '../../testing/api-stub';
import { AddDeviceDialog } from './add-device-dialog';

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
      ],
    });
    const fixture = TestBed.createComponent(AddDeviceDialog);
    await fixture.whenStable();
    return fixture;
  }

  function text(fixture: ComponentFixture<AddDeviceDialog>): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function buttonLabels(fixture: ComponentFixture<AddDeviceDialog>): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button'),
    ).map((button) => (button.textContent ?? '').trim());
  }

  beforeEach(() => {
    api = new SmartHomeApiStub();
    discovery = new DiscoveryStub();
  });

  it('lists what the scan found: network name and MAC address', async () => {
    const fixture = await render();
    expect(text(fixture)).toContain('SmartHome-5A7C');
    expect(text(fixture)).toContain('A4:CF:12:AA:01:02');
    expect(text(fixture)).toContain('-42 dBm');
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
    expect(names).toEqual(['SmartHome-Taet-Paa', 'SmartHome-Midt', 'SmartHome-Langt-Vaek']);
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

  it('offers nothing but looking — no name, no room, no add button', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('select')).toBeNull();
    expect(buttonLabels(fixture)).toEqual(['Søg igen', 'Luk']);
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
