import { DestroyRef, inject, Injectable, InjectionToken } from '@angular/core';
import { HomeStore } from '../home-store/home-store';

/**
 * How often the home is re-read. Long enough that a room full of tablets does
 * not flood the hub, short enough that a temperature does not sit visibly
 * stale. A token so tests can run the real timing without waiting for it.
 */
export const REFRESH_INTERVAL_MS = new InjectionToken<number>('REFRESH_INTERVAL_MS', {
  providedIn: 'root',
  factory: () => 15_000,
});

/**
 * Keeps the screen up to date by re-reading the home on a timer.
 *
 * Polling, not push. The API has nothing that can tell the app "something
 * changed" — a webhook cannot reach a browser, and Server-Sent Events would
 * need both a new endpoint and Apache configured not to buffer it. This works
 * today, through any proxy, and is a handful of lines. Swap the timer for an
 * `EventSource` here when the hub can push, and nothing else has to change.
 *
 * Three things it deliberately does NOT do:
 *
 * - **Tick in a hidden tab.** A tablet left on a shelf would otherwise ask the
 *   hub for the whole home every few seconds forever. It refreshes once when
 *   the tab comes back instead — which is exactly when what is on screen is
 *   most out of date.
 * - **Overlap.** A slow hub could otherwise leave several reads in flight at
 *   once, and the last to answer wins regardless of which was newest.
 * - **Call `load()`.** That would force-expire pending undo toasts and flash the
 *   whole screen into its loading state. See `HomeStore.refresh`.
 */
@Injectable({ providedIn: 'root' })
export class AutoRefresh {
  private readonly store = inject(HomeStore);
  private readonly intervalMs = inject(REFRESH_INTERVAL_MS);

  private timer: ReturnType<typeof setInterval> | null = null;
  private onVisibilityChange: (() => void) | null = null;
  private inFlight = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = setInterval(() => this.tick(), this.intervalMs);

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.tick();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.onVisibilityChange !== null) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
  }

  private tick(): void {
    if (this.inFlight || document.visibilityState !== 'visible') {
      return;
    }
    this.inFlight = true;
    void this.store.refresh().finally(() => {
      this.inFlight = false;
    });
  }
}
