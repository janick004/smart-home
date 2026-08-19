import { DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

const PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * "Tryk og hold på en flise" — emits after a 500 ms press. Right-click (and the
 * keyboard context-menu key) triggers it too, so the menu is reachable on desktop.
 * The click that would normally follow a completed long press is swallowed.
 */
@Directive({ selector: '[appLongPress]' })
export class LongPressDirective {
  readonly appLongPress = output<void>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private startX = 0;
  private startY = 0;
  private suppressNextClick = false;

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      // A fresh interaction starts clean: if the click after a completed long press
      // landed elsewhere (e.g. on the opened menu's backdrop), the flag went stale
      // and must not swallow this press's click.
      this.suppressNextClick = false;
      this.startX = event.clientX;
      this.startY = event.clientY;
      this.clearTimer();
      this.timer = setTimeout(() => {
        this.timer = null;
        this.suppressNextClick = true;
        this.appLongPress.emit();
      }, PRESS_MS);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (
        this.timer !== null &&
        (Math.abs(event.clientX - this.startX) > MOVE_TOLERANCE_PX ||
          Math.abs(event.clientY - this.startY) > MOVE_TOLERANCE_PX)
      ) {
        this.clearTimer();
      }
    };

    const cancel = (): void => this.clearTimer();

    const onClick = (event: MouseEvent): void => {
      if (this.suppressNextClick) {
        this.suppressNextClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const onContextMenu = (event: Event): void => {
      event.preventDefault();
      this.clearTimer();
      this.appLongPress.emit();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', cancel);
    element.addEventListener('pointerleave', cancel);
    element.addEventListener('pointercancel', cancel);
    // Capture phase so the swallow runs before Angular's own (click) listener.
    element.addEventListener('click', onClick, { capture: true });
    element.addEventListener('contextmenu', onContextMenu);

    inject(DestroyRef).onDestroy(() => {
      this.clearTimer();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', cancel);
      element.removeEventListener('pointerleave', cancel);
      element.removeEventListener('pointercancel', cancel);
      element.removeEventListener('click', onClick, { capture: true });
      element.removeEventListener('contextmenu', onContextMenu);
    });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
