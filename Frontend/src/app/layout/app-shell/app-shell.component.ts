import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from "@angular/core";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { PortalStore } from "../../core/services/portal.service";
import { ThemeToggleComponent } from "../../shared/components/theme-toggle.component";
@Component({
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ThemeToggleComponent],
  templateUrl: "./app-shell.component.html",
})
export class ShellComponent {
  s = inject(PortalStore);
  router = inject(Router);
  menuOpen = false;
  private injector = inject(Injector);
  private navigation =
    viewChild.required<ElementRef<HTMLElement>>("navigation");
  private menuToggle =
    viewChild.required<ElementRef<HTMLButtonElement>>("menuToggle");
  menu = [
    {
      path: "/dashboard",
      label: "Dashboard",
      icon: "M3 3h18v18H3zM3 9h18M10 9v12",
    },
    {
      path: "/almoxarifado/equipamentos",
      label: "Equipamentos",
      icon: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4m-9 4v10",
      roles: ["ADMIN", "ALMOXARIFADO"],
    },
    {
      path: "/almoxarifado/movimentacoes",
      label: "Movimentações",
      icon: "M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4",
      roles: ["ADMIN", "ALMOXARIFADO"],
    },
    {
      path: "/rh/colaboradores",
      label: "Colaboradores",
      icon: "M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4m-4-9a4 4 0 0 1 0 7M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
      roles: ["ADMIN", "RH", "SEGURANCA_TRABALHO"],
    },
    {
      path: "/rh/fichas",
      label: "Fichas de EPI",
      icon: "M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6",
      roles: ["ADMIN", "RH", "SEGURANCA_TRABALHO"],
    },
    {
      path: "/rh/kits",
      label: "Kits de EPI",
      icon: "M4 7h16v13H4zM9 7V4h6v3M4 12h16",
      roles: ["ADMIN", "RH", "SEGURANCA_TRABALHO"],
    },
    {
      path: "/relatorios",
      label: "Relatórios",
      icon: "M4 3v17h17M8 16v-4m5 4V7m5 9v-6",
    },
    {
      path: "/administracao",
      label: "Administração",
      icon: "M4 7h16M4 17h16M9 4v6m6 4v6",
      roles: ["ADMIN"],
    },
  ];
  openMenu() {
    this.menuOpen = true;
    afterNextRender(
      () => {
        if (this.menuOpen) {
          this.navigation().nativeElement.querySelector("a")?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  closeMenu() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menuToggle().nativeElement.focus();
  }

  async logout() {
    await this.s.logout();
    await this.router.navigateByUrl("/login");
  }
}
