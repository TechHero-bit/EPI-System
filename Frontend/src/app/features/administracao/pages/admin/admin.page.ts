import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../../../core/services/portal.service";
import { roles, roleNames } from "../../../../core/models/portal.model";
import { alphabetical } from "../../../../shared/utils/alphabetical";
@Component({
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./admin.page.html",
})
export class AdminComponent implements OnInit {
  s = inject(PortalStore);
  roles = alphabetical(roles, (role) => roleNames[role]);
  names = roleNames;
  members: any[] = [];
  ngOnInit() {
    void this.s.action(async () => {
      this.members = this.s.demo
        ? [{ user_id: "visitante@example.invalid", role: this.s.role }]
        : await this.s.request("/api/admin/members");
    }, "");
  }
  save(m: any) {
    void this.s.action(
      () =>
        this.s.request(`/api/admin/members/${m.user_id}`, "PATCH", {
          role: m.role,
        }),
      "Perfil atualizado.",
    );
  }
}
