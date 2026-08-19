import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogService } from '../../core/dialog/dialog';
import { HomeStore } from '../../core/home-store/home-store';
import { Modal } from '../../shared/modal/modal';

/**
 * One-tap room names. Translatable: in another locale these should be that
 * locale's typical room names, not the Danish ones.
 */
const SUGGESTIONS = [
  $localize`:one-tap room name suggestion@@createRoom.suggestionHall:Gang`,
  $localize`:one-tap room name suggestion@@createRoom.suggestionBasement:Kælder`,
  $localize`:one-tap room name suggestion@@createRoom.suggestionTerrace:Terrasse`,
  $localize`:one-tap room name suggestion@@createRoom.suggestionOffice:Kontor`,
];

/** "Opret rum" (mockup 04): a name and a few one-tap suggestions. */
@Component({
  selector: 'app-create-room-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal],
  templateUrl: './create-room-dialog.html',
})
export class CreateRoomDialog {
  private readonly store = inject(HomeStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  protected readonly name = signal('');
  protected readonly submitting = signal(false);

  protected readonly suggestions = computed(() => {
    const taken = new Set(this.store.rooms().map((room) => room.name.toLocaleLowerCase('da')));
    return SUGGESTIONS.filter((suggestion) => !taken.has(suggestion.toLocaleLowerCase('da')));
  });

  protected readonly isDuplicate = computed(() => {
    const name = this.name().trim().toLocaleLowerCase('da');
    return (
      name !== '' && this.store.rooms().some((room) => room.name.toLocaleLowerCase('da') === name)
    );
  });

  protected readonly canSubmit = computed(
    () => this.name().trim() !== '' && !this.isDuplicate() && !this.submitting(),
  );

  protected onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected pickSuggestion(suggestion: string): void {
    this.name.set(suggestion);
  }

  protected submit(): void {
    void this.runSubmit();
  }

  private async runSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.submitting.set(true);
    const room = await this.store.addRoom(this.name());
    this.submitting.set(false);
    if (room !== null) {
      this.dialogs.close();
      void this.router.navigate(['/rum', room.id]);
    }
    // On failure the store already showed an alert toast; the dialog stays open.
  }

  protected close(): void {
    this.dialogs.close();
  }
}
