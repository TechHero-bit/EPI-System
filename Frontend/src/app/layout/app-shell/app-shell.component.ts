import { Component, inject } from "@angular/core";
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
  menu = [
    { path: "/dashboard", label: "Dashboard", icon: "◫" },
    {
      path: "/almoxarifado/equipamentos",
      label: "Equipamentos",
      icon: "▤",
      roles: ["ADMIN", "ALMOXARIFADO"],
    },
    {
      path: "/almoxarifado/movimentacoes",
      label: "Movimentações",
      icon: "⇄",
      roles: ["ADMIN", "ALMOXARIFADO"],
    },
    {
      path: "/rh/colaboradores",
      label: "Colaboradores",
      icon: "♧",
      roles: ["ADMIN", "RH", "SEGURANCA_TRABALHO"],
    },
    {
      path: "/rh/fichas",
      label: "Fichas de EPI",
      icon: "▧",
      roles: ["ADMIN", "RH", "SEGURANCA_TRABALHO"],
    },
    { path: "/relatorios", label: "Relatórios", icon: "▦" },
    {
      path: "/administracao",
      label: "Administração",
      icon: "⚙",
      roles: ["ADMIN"],
    },
  ];
  async logout() {
    await this.s.logout();
    await this.router.navigateByUrl("/login");
  }
}
