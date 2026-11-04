import { Component, inject } from "@angular/core";
import { ThemeService } from "../../core/services/theme.service";

@Component({
  selector: "epi-theme-toggle",
  standalone: true,
  template: `
    <button
      type="button"
      class="theme-toggle"
      [attr.aria-label]="
        theme.mode() === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'
      "
      [title]="
        theme.mode() === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'
      "
      [attr.aria-pressed]="theme.mode() === 'dark'"
      (click)="theme.toggle()"
    >
      <svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
        @if (theme.mode() === "dark") {
          <path d="M20 15a8 8 0 0 1-11-11 8.5 8.5 0 1 0 11 11Z" />
        } @else {
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
          />
        }
      </svg>
      <span class="theme-toggle-label">{{
        theme.mode() === "dark" ? "Modo escuro" : "Modo claro"
      }}</span>
    </button>
  `,
})
export class ThemeToggleComponent {
  theme = inject(ThemeService);
}
