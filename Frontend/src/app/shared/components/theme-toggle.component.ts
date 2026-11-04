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
      <span aria-hidden="true">{{ theme.mode() === "dark" ? "☾" : "☀" }}</span>
      <span class="theme-toggle-label">{{
        theme.mode() === "dark" ? "Modo escuro" : "Modo claro"
      }}</span>
    </button>
  `,
})
export class ThemeToggleComponent {
  theme = inject(ThemeService);
}
