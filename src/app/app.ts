import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { DialogService } from './core/dialog/dialog';
import { HomeStore } from './core/home-store/home-store';
import { AutoRefresh } from './core/live/auto-refresh';
import { DialogHost } from './dialogs/dialog-host/dialog-host';
import { TabletFrame } from './layout/tablet-frame/tablet-frame';
import { ToastHost } from './toasts/toast-host/toast-host';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TabletFrame, DialogHost, ToastHost],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  constructor() {
    // Started here, once, for the app's lifetime — not per page. A page that
    // started its own would leave one running per visit.
    inject(AutoRefresh).start();
  }

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** On Enheder the top-bar action is the specific, white "+ Tilføj enhed". */
  protected readonly onDevicesPage = computed(() => this.url().startsWith('/enheder'));

  protected readonly addMenuOpen = signal(false);

  protected toggleAddMenu(): void {
    this.addMenuOpen.update((open) => !open);
  }

  protected closeAddMenu(): void {
    this.addMenuOpen.set(false);
  }

  protected openAddDevice(): void {
    this.closeAddMenu();
    // Every device lives in a room, so the first room comes first.
    if (this.store.rooms().length === 0) {
      this.dialogs.open({ kind: 'create-room' });
    } else {
      this.dialogs.open({ kind: 'add-device' });
    }
  }

  protected openCreateRoom(): void {
    this.closeAddMenu();
    this.dialogs.open({ kind: 'create-room' });
  }
}
