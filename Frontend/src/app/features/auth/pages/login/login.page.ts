import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { type Role } from "../../../../core/models/portal.model";
import { ThemeToggleComponent } from "../../../../shared/components/theme-toggle.component";
@Component({
  standalone: true,
  imports: [FormsModule, ThemeToggleComponent],
  templateUrl: "./login.page.html",
})
export class LoginComponent {
  s = inject(PortalStore);
  router = inject(Router);
  roles: Role[] = ["ALMOXARIFADO", "RH"];
  names: Partial<Record<Role, string>> = {
    RH: "RH",
    ALMOXARIFADO: "Almoxarifado",
  };
  role: Role = "RH";
  email = "";
  password = "";
  recovery = new URLSearchParams(location.search).has("recovery");
  constructor() {
    void this.s.action(() => this.s.init(), "");
  }
  async submit() {
    const ok = await this.s.action(async () => {
      if (this.recovery) {
        await this.s.updatePassword(this.password);
        return;
      }
      await this.s.login(this.email, this.password, this.role);
    }, "");
    if (ok) await this.router.navigateByUrl("/dashboard");
  }
}
