import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../../../core/services/portal.service";
import {
  roles,
  roleNames,
  LIST_KINDS,
  type ListKind,
} from "../../../../core/models/portal.model";
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
  listKinds = Object.entries(LIST_KINDS).map(([kind, meta]) => ({
    kind: kind as ListKind,
    ...meta,
  }));
  drafts: Record<string, string> = {};
  rows(key: string) {
    return alphabetical(((this.s.data() as any)[key] ?? []) as any[], (r) => r.name);
  }
  addItem(kind: ListKind) {
    const name = (this.drafts[kind] ?? "").trim();
    void this.s
      .action(() => this.s.saveListItem(kind, { name }), "Item incluído.")
      .then((ok) => {
        if (ok) this.drafts[kind] = "";
      });
  }
  renameItem(kind: ListKind, row: any, name: string) {
    if (!name.trim() || name.trim() === row.name) return;
    void this.s.action(
      () => this.s.saveListItem(kind, { name: name.trim() }, row.id),
      "Item atualizado.",
    );
  }
  toggleItem(kind: ListKind, row: any) {
    void this.s.action(
      () => this.s.saveListItem(kind, { active: !row.active }, row.id),
      row.active ? "Item desativado." : "Item reativado.",
    );
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
