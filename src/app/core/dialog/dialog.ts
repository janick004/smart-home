import { Injectable, signal } from '@angular/core';

/** Every overlay in the app, with the context it needs. Only one is open at a time. */
export type DialogState =
  | { readonly kind: 'add-device' }
  | { readonly kind: 'create-room' }
  | { readonly kind: 'rename-room'; readonly roomId: string }
  | { readonly kind: 'delete-room'; readonly roomId: string }
  | { readonly kind: 'device-menu'; readonly deviceId: string }
  | { readonly kind: 'rename-device'; readonly deviceId: string }
  | { readonly kind: 'move-device'; readonly deviceId: string }
  | { readonly kind: 'device-detail'; readonly deviceId: string };

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly state = signal<DialogState | null>(null);
  readonly active = this.state.asReadonly();

  /**
   * The element that had focus before the first dialog opened. Chained dialogs
   * (device menu → rename) keep the original opener, so focus lands back on the
   * tile the interaction started from.
   */
  private opener: HTMLElement | null = null;

  open(dialog: DialogState): void {
    if (this.state() === null) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    this.state.set(dialog);
  }

  close(): void {
    this.state.set(null);
    const opener = this.opener;
    this.opener = null;
    // The opener may be gone (device removed, page changed) — only restore to a live element.
    if (opener?.isConnected) {
      opener.focus();
    }
  }
}
