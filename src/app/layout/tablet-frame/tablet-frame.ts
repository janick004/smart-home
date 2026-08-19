import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

/**
 * The design canvas, in CSS pixels: an iPad Pro 12.9" in landscape. The system
 * only exists in this shape — it never turns to portrait and there is no phone
 * layout.
 */
const CANVAS_WIDTH = 1366;
const CANVAS_HEIGHT = 1024;
/** Bezel around the screen, in canvas pixels. */
const BEZEL = 36;
/** Breathing room between the device and the window edge. */
const GUTTER = 28;

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Draws the app as an iPad and holds it there: the app always renders on the
 * fixed 1366 x 1024 landscape canvas, scaled down as a whole to fit the window.
 * A narrow window shows a smaller iPad — never a different design.
 *
 * Everything that positions itself against the viewport (modals, toasts, the
 * add-menu backdrop) must be projected *into* this component: the device is a
 * transformed element, which makes it the containing block for `position: fixed`
 * descendants, and it re-points `--app-w` / `--app-h` at the canvas so those
 * overlays measure themselves against the iPad screen instead of the window.
 */
@Component({
  selector: 'app-tablet-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tablet-frame.html',
  styleUrl: './tablet-frame.scss',
  host: {
    '[style.--frame-scale]': 'scale()',
  },
})
export class TabletFrame {
  private readonly viewport = signal<ViewportSize>(readViewport());

  constructor() {
    const onResize = (): void => this.viewport.set(readViewport());
    window.addEventListener('resize', onResize, { passive: true });
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', onResize));
  }

  /**
   * How much the whole device is shrunk to fit the window. Never above 1 — the
   * design is drawn for these pixels and is not stretched past them.
   */
  protected readonly scale = computed(() => {
    const { width, height } = this.viewport();
    const outerWidth = CANVAS_WIDTH + 2 * BEZEL;
    const outerHeight = CANVAS_HEIGHT + 2 * BEZEL;
    return Math.min(
      1,
      (width - 2 * GUTTER) / outerWidth,
      (height - 2 * GUTTER) / outerHeight,
    ).toFixed(4);
  });
}

/**
 * The layout viewport in CSS pixels. `documentElement.clientWidth/Height` — not
 * `window.innerWidth/Height`, which reports the visual viewport and is wrong
 * whenever the page is zoomed or shown in a device emulator.
 */
function readViewport(): ViewportSize {
  const root = document.documentElement;
  return { width: root.clientWidth, height: root.clientHeight };
}
