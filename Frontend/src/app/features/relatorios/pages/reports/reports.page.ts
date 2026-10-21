import { Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../../../core/services/portal.service";
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: "./reports.page.html",
})
export class ReportsComponent {
  s = inject(PortalStore);
  query = "";
  from = "";
  to = "";
  get audits() {
    return this.s
      .data()
      .audits.filter(
        (a) =>
          `${a.action} ${a.entity ?? ""}`
            .toLowerCase()
            .includes(this.query.toLowerCase()) &&
          (!this.from || a.created_at.slice(0, 10) >= this.from) &&
          (!this.to || a.created_at.slice(0, 10) <= this.to),
      );
  }
  exportCsv() {
    const cell = (v: any) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      ["Data UTC", "Ação", "Entidade", "Identificador", "Responsável"],
      ...this.audits.map((a) => [
        a.created_at,
        a.action,
        a.entity,
        a.entity_id,
        a.actor_id,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = (this.s.demo ? "DEMO-" : "") + "auditoria.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
