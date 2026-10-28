import { Component, computed, inject, OnInit } from "@angular/core";
import { DatePipe, formatDate } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../../../core/services/portal.service";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, StatusComponent],
  templateUrl: "./reports.page.html",
})
export class ReportsComponent implements OnInit {
  s = inject(PortalStore);
  query = "";
  from = "";
  to = "";
  delivery = "";
  signature = "";
  private readonly labels: Record<string, string> = {
    PENDING: "Assinatura pendente",
    SIGNED_MANUAL: "Assinada presencialmente",
    SIGNED_ELECTRONIC: "Assinada eletronicamente",
    UNCONFIRMED: "Entrega pendente",
    CONFIRMED: "Entregue",
    CANCELLED: "Cancelado",
  };
  readonly loadedRows = computed(() => {
    const data = this.s.data();
    return [...data.sheets]
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at))
      .slice(0, 100)
      .map((sheet) => {
        const employee = data.employees.find((e) => e.id === sheet.employee_id);
        const state = data.states.find((s) => s.sheet_id === sheet.id);
        const cancelled = state?.reservation_status === "CANCELLED";
        return {
          id: sheet.id,
          name: employee?.name ?? "Colaborador não identificado",
          registration:
            sheet.employee_registration ||
            employee?.registration ||
            "Não informada",
          version: sheet.version,
          issuedAt: sheet.issued_at,
          date: formatDate(sheet.issued_at, "yyyy-MM-dd", "en-US"),
          signature: cancelled
            ? "CANCELLED"
            : (state?.signature_status ?? "UNKNOWN"),
          delivery: cancelled
            ? "CANCELLED"
            : (state?.receipt_status ?? "UNKNOWN"),
        };
      });
  });
  ngOnInit() {
    void this.refresh();
  }
  async refresh() {
    await this.s.action(() => this.s.load(), "");
  }
  get invalidPeriod() {
    return !!this.from && !!this.to && this.from > this.to;
  }
  private searchText(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }
  get rows() {
    if (this.invalidPeriod) return [];
    const query = this.searchText(this.query.trim());
    return this.loadedRows().filter(
      (row) =>
        this.searchText(`${row.name} ${row.registration}`).includes(query) &&
        (!this.from || row.date >= this.from) &&
        (!this.to || row.date <= this.to) &&
        (!this.delivery || row.delivery === this.delivery) &&
        (!this.signature || row.signature === this.signature),
    );
  }
  get metrics() {
    const rows = this.rows;
    return [
      { label: "Fichas encontradas", value: rows.length },
      {
        label: "Entregues",
        value: rows.filter((r) => r.delivery === "CONFIRMED").length,
      },
      {
        label: "Entrega pendente",
        value: rows.filter((r) => r.delivery === "UNCONFIRMED").length,
      },
      {
        label: "Canceladas",
        value: rows.filter((r) => r.delivery === "CANCELLED").length,
      },
    ];
  }
  statusLabel(status: string) {
    return this.labels[status] ?? "Não informado";
  }
  clearFilters() {
    this.query = this.from = this.to = this.delivery = this.signature = "";
  }
  exportCsv() {
    if (!this.rows.length) return;
    const cell = (v: any) =>
      '"' +
      String(v ?? "")
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [
        "Emissão",
        "Colaborador",
        "Matrícula",
        "Versão da ficha",
        "Assinatura",
        "Entrega física",
      ],
      ...this.rows.map((row) => [
        formatDate(row.issuedAt, "dd/MM/yyyy HH:mm", "en-US"),
        row.name,
        row.registration,
        row.version,
        this.statusLabel(row.signature),
        this.statusLabel(row.delivery),
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
    a.download = (this.s.demo ? "DEMO-" : "") + "relatorio-fichas-entregas.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
