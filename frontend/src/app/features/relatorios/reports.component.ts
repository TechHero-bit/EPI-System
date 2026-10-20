import { Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../core/portal.store";
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `<div class="page-head">
      <div>
        <span class="eyebrow">INDICADORES E EVIDÊNCIAS</span>
        <h1>Relatórios</h1>
        <p>Consulte as movimentações e a trilha de auditoria da organização.</p>
      </div>
      <button class="primary" (click)="exportCsv()">
        Exportar consulta CSV
      </button>
    </div>
    <section class="panel">
      <div class="toolbar">
        <input
          aria-label="Buscar evento"
          [(ngModel)]="query"
          placeholder="Buscar ação ou entidade…"
        /><label>De<input type="date" [(ngModel)]="from" /></label
        ><label>Até<input type="date" [(ngModel)]="to" /></label>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data / hora</th>
              <th>Evento</th>
              <th>Entidade</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            @for (a of audits; track a.id) {
              <tr>
                <td>{{ a.created_at | date: "dd/MM/yyyy HH:mm:ss" }}</td>
                <td>
                  <strong>{{ a.action }}</strong>
                </td>
                <td>
                  {{ a.entity || "Ficha" }}<br /><small>{{
                    a.entity_id
                  }}</small>
                </td>
                <td>
                  {{
                    a.actor_id ||
                      (s.demo ? "Pessoa demonstradora" : "Evento do sistema")
                  }}
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="empty">Nenhum evento encontrado.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="note">
        Consulta operacional dos últimos 100 eventos carregados. Use a API de
        auditoria paginada para períodos maiores. Exportações de documentos
        individuais estão nos detalhes de cada ficha.
      </p>
    </section>`,
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
