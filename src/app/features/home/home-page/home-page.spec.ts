import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SmartHomeApi } from '../../../core/api/smart-home-api';
import { HomeStore } from '../../../core/home-store/home-store';
import { SmartHomeApiStub } from '../../../testing/api-stub';
import { HomePage } from './home-page';

/**
 * The home screen must always say something that makes sense — also when the
 * house is empty. The three states here are the ones actually met: nothing yet,
 * a house with lamps, and a house where no device has anything to show on a
 * tile.
 */
describe('HomePage', () => {
  let api: SmartHomeApiStub;

  async function render(): Promise<{ fixture: ComponentFixture<HomePage>; text: string }> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: SmartHomeApi, useValue: api },
      ],
    });
    await TestBed.inject(HomeStore).load();
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    // textContent, not innerText: the test environment does no layout.
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return { fixture, text };
  }

  beforeEach(() => {
    api = new SmartHomeApiStub();
    TestBed.resetTestingModule();
  });

  it('asks for the first device — not "Alt lys er slukket" — when the home has rooms but no devices', async () => {
    api.devices = [];
    api.samples = [];
    api.events = [];

    const { fixture, text } = await render();

    expect(text).toContain('Ingen enheder endnu');
    expect(text).toContain('Tilføj enhed');
    expect(text).not.toContain('Alt lys er slukket');
    // The rooms stand ready, so the next step is clear.
    expect(text).toContain('5 rum er klar');
    expect(text).toContain('Stue · Køkken · Soveværelse · Badeværelse · Garage');

    const cta = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.btn--primary',
    );
    expect(cta?.textContent?.trim()).toBe('Tilføj enhed');
  });

  it('shows the light tile as soon as there is a lamp', async () => {
    const { text } = await render();

    expect(text).toContain('Lys i huset');
    expect(text).not.toContain('Ingen enheder endnu');
  });

  it('says the house looks normal when devices exist but none of them fills a tile', async () => {
    // Only a motion sensor: no lamp to switch on, no temperature to show.
    api.devices = api.devices.filter((device) => device.deviceId === 4);
    api.samples = api.samples.filter((sample) => sample.deviceId === 4);
    api.events = [];

    const { text } = await render();

    expect(text).toContain('Alt ser normalt ud');
    expect(text).toContain('1 enhed i huset');
    expect(text).not.toContain('Lys i huset');
    expect(text).not.toContain('Ingen enheder endnu');
  });

  it('gives a humidity-only room its own tile', async () => {
    // The bathroom has only a humidity sensor.
    const { text } = await render();

    expect(text).toContain('Badeværelse');
    expect(text).toContain('68 %');
  });

  it('does not count a lamp that does not answer as switched on', async () => {
    // Lamp 1 last got an ON command, but the device no longer answers.
    api.devices = api.devices.map((device) =>
      device.deviceId === 1 ? { ...device, status: 'Offline' } : device,
    );

    const { text } = await render();

    expect(text).toContain('Alt lys er slukket');
    expect(text).not.toContain('1 lampe er tændt');
    // The dead lamp, on the other hand, calls for help.
    expect(text).toContain('Loftlampe svarer ikke');
  });

  it('keeps the first-run screen when there are no rooms at all', async () => {
    api.rooms = [];
    api.devices = [];
    api.samples = [];
    api.events = [];

    const { text } = await render();

    expect(text).toContain('Start med ét rum');
    expect(text).toContain('Opret dit første rum');
  });
});
