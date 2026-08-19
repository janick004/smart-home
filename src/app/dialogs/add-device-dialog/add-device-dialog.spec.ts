import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SmartHomeApi } from '../../core/api/smart-home-api';
import { DeviceDiscoveryService, DiscoveryResult } from '../../core/discovery/discovery';
import { HomeStore } from '../../core/home-store/home-store';
import { DiscoveredDevice } from '../../core/models';
import { SmartHomeApiStub } from '../../testing/api-stub';
import { AddDeviceDialog } from './add-device-dialog';

function found(mac: string, overrides: Partial<DiscoveredDevice> = {}): DiscoveredDevice {
  return { mac, suggestedName: '', kind: null, ip: null, lastSeen: null, ...overrides };
}

/** Answers immediately, with no delay and no randomness. */
class DiscoveryStub {
  result: DiscoveryResult = {
    status: 'found',
    devices: [found('A4:CF:12:AA:01:02', { suggestedName: 'Termometer', kind: 'thermometer' })],
  };

  discoverDevices(): Promise<DiscoveryResult> {
    return Promise.resolve(this.result);
  }
}

describe('AddDeviceDialog', () => {
  let api: SmartHomeApiStub;
  let discovery: DiscoveryStub;

  async function render(): Promise<{ fixture: ComponentFixture<AddDeviceDialog>; text: string }> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SmartHomeApi, useValue: api },
        { provide: DeviceDiscoveryService, useValue: discovery },
      ],
    });
    await TestBed.inject(HomeStore).load();
    const fixture = TestBed.createComponent(AddDeviceDialog);
    await fixture.whenStable();
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return { fixture, text };
  }

  beforeEach(() => {
    api = new SmartHomeApiStub();
    discovery = new DiscoveryStub();
    TestBed.resetTestingModule();
  });

  it('shows what the hub found, and preselects a single find', async () => {
    const { fixture, text } = await render();

    expect(text).toContain('Vi fandt én ny enhed');
    expect(text).toContain('Termometer');
    // The MAC address identifies the find, so it belongs on the card.
    expect(text).toContain('A4:CF:12:AA:01:02');
    expect(text).toContain('Valgt');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector<HTMLInputElement>('input.field')?.value).toBe('Termometer');
    // The announced type must be the one the picker SHOWS: a <select> with a
    // [value] binding gets its value before @for renders the options, and the
    // browser then selects the first one — so the user would have registered a
    // thermometer as a lamp without touching anything.
    expect(element.querySelectorAll<HTMLSelectElement>('select')[0].value).toBe('thermometer');
  });

  it('lets you pick between several finds', async () => {
    discovery.result = {
      status: 'found',
      devices: [
        found('A4:CF:12:AA:01:02', { suggestedName: 'Termometer', kind: 'thermometer' }),
        found('A4:CF:12:BB:07:31', { ip: '192.168.1.134' }),
      ],
    };

    const { fixture, text } = await render();
    const element = fixture.nativeElement as HTMLElement;

    expect(text).toContain('Vi fandt 2 nye enheder');
    // A find that announced neither name nor type still gets a title.
    expect(text).toContain('Ukendt enhed');
    expect(text).toContain('192.168.1.134');
    // Nothing is chosen for you when there is more than one.
    expect(text).not.toContain('Valgt');

    const cards = element.querySelectorAll<HTMLButtonElement>('.found-card');
    expect(cards.length).toBe(2);
    cards[1].click();
    await fixture.whenStable();

    expect((element.textContent ?? '').replace(/\s+/g, ' ')).toContain('Valgt');
    // No announced type: the type picker stays empty for the user to answer.
    expect(element.querySelectorAll<HTMLSelectElement>('select')[0].value).toBe('');
  });

  it('registers the picked device on its MAC address', async () => {
    const { fixture } = await render();
    const element = fixture.nativeElement as HTMLElement;

    const room = element.querySelectorAll<HTMLSelectElement>('select')[1];
    room.value = '1';
    room.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const submit = element.querySelector<HTMLButtonElement>('.btn--primary');
    expect(submit?.disabled).toBe(false);
    submit?.click();
    await fixture.whenStable();

    const registered = api.devices.find((device) => device.macAddress === 'A4:CF:12:AA:01:02');
    expect(registered).toMatchObject({ name: 'Termometer', type: 'thermometer', roomId: 1 });
  });

  it('says the hub could not be asked, rather than claiming the network is empty', async () => {
    discovery.result = { status: 'unavailable' };

    const { text } = await render();

    expect(text).toContain('Vi kunne ikke spørge hjemmet om nye enheder');
    expect(text).toContain('Søg igen');
    expect(text).not.toContain('Vi fandt ingen nye enheder');
  });

  it('says so plainly when the network has nothing new on it', async () => {
    discovery.result = { status: 'none' };

    const { text } = await render();

    expect(text).toContain('Vi fandt ingen nye enheder');
    expect(text).toContain('Søg igen');
  });

  it('explains why it cannot continue when there are no rooms yet', async () => {
    api.rooms = [];
    api.devices = [];

    const { text } = await render();

    expect(text).toContain('Enheden skal bo i et rum');
    expect(text).toContain('Opret rum');
    expect(text).not.toContain('Giv den et navn');
  });
});
