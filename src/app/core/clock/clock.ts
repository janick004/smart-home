import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/**
 * A ticking "now" signal so relative timestamps ("for 2 minutter siden")
 * stay fresh without every component running its own timer.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly nowState = signal(new Date());
  readonly now = this.nowState.asReadonly();

  constructor() {
    const timer = setInterval(() => this.nowState.set(new Date()), 10_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
