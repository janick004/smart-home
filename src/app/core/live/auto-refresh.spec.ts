import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HomeStore } from '../home-store/home-store';
import { AutoRefresh, REFRESH_INTERVAL_MS } from './auto-refresh';

/** Counts refreshes and lets a test hold one open. */
class StoreStub {
  calls = 0;
  private release: (() => void) | null = null;

  /** Makes the next refresh hang until `finish()` is called. */
  hold(): void {
    this.release = null;
  }

  refresh(): Promise<boolean> {
    this.calls++;
    if (this.release === null && this.hanging) {
      return new Promise<boolean>((resolve) => {
        this.release = () => resolve(true);
      });
    }
    return Promise.resolve(true);
  }

  hanging = false;

  finish(): void {
    this.release?.();
    this.release = null;
  }
}

/** jsdom reports 'visible'; the property is readonly, so it is redefined. */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const TICK = 5;

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('AutoRefresh', () => {
  let store: StoreStub;
  let refresher: AutoRefresh;

  beforeEach(() => {
    store = new StoreStub();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: HomeStore, useValue: store },
        { provide: REFRESH_INTERVAL_MS, useValue: TICK },
      ],
    });
    refresher = TestBed.inject(AutoRefresh);
    setVisibility('visible');
  });

  afterEach(() => {
    refresher.stop();
    setVisibility('visible');
  });

  it('refreshes repeatedly once started', async () => {
    refresher.start();
    await wait(TICK * 4);
    expect(store.calls).toBeGreaterThan(1);
  });

  it('does nothing before it is started', async () => {
    await wait(TICK * 4);
    expect(store.calls).toBe(0);
  });

  it('stops when told to', async () => {
    refresher.start();
    await wait(TICK * 3);
    const seen = store.calls;
    refresher.stop();
    await wait(TICK * 4);
    expect(store.calls).toBe(seen);
  });

  it('leaves the hub alone while the tab is hidden', async () => {
    refresher.start();
    setVisibility('hidden');
    store.calls = 0;
    await wait(TICK * 5);
    // A tablet left on a shelf must not ask for the whole home forever.
    expect(store.calls).toBe(0);
  });

  it('refreshes at once when the tab comes back', async () => {
    refresher.start();
    setVisibility('hidden');
    await wait(TICK * 2);
    store.calls = 0;

    setVisibility('visible');

    // Straight away, not on the next tick: returning to the tab is exactly when
    // what is on screen is most out of date.
    expect(store.calls).toBe(1);
  });

  it('never runs two refreshes at once', async () => {
    store.hanging = true;
    refresher.start();
    await wait(TICK * 6);

    // One in flight, and every tick since then skipped rather than piling up.
    expect(store.calls).toBe(1);

    store.finish();
    await wait(TICK * 3);
    expect(store.calls).toBeGreaterThan(1);
  });

  it('starting twice does not double the rate', async () => {
    refresher.start();
    refresher.start();
    await wait(TICK * 6);
    const twice = store.calls;

    refresher.stop();
    store.calls = 0;
    refresher.start();
    await wait(TICK * 6);

    // Within one tick of each other — not double.
    expect(Math.abs(twice - store.calls)).toBeLessThanOrEqual(2);
  });
});
