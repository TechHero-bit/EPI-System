import { Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, StatusComponent],
  templateUrl: "./dashboard.page.html",
})
export class DashboardComponent {
  s = inject(PortalStore);
  date = new Date();
  get isWarehouse() {
    return this.s.role === "ALMOXARIFADO";
  }
  get title() {
    return this.isWarehouse ? "Dashboard do Almoxarifado" : "Dashboard do RH";
  }
  get metrics() {
    if (this.isWarehouse)
      return [
        {
          label: "Equipamentos",
          value: this.s.data().products.filter((p) => p.active).length,
          caption: "Produtos ativos no catálogo",
        },
        {
          label: "Tamanhos cadastrados",
          value: this.s.data().variants.length,
          caption: "Variações dos equipamentos",
        },
        {
          label: "Categorias",
          value: this.categoryCounts.length,
          caption: "Categorias no catálogo",
        },
        {
          label: "CAs a vencer ou vencidos",
          value: this.expiring,
          caption: "Atenção nos próximos 30 dias",
        },
      ];
    return [
      {
        label: "Colaboradores ativos",
        value: this.s.data().employees.filter((e) => !e.termination_date)
          .length,
        caption: "Na sua organização",
      },
      {
        label: "Fichas emitidas",
        value: this.s.data().sheets.length,
        caption: "Documentos no histórico",
      },
      {
        label: "Assinaturas pendentes",
        value: this.signatureCount("PENDING"),
        caption: "Aguardando assinatura",
      },
      {
        label: "Entregas pendentes",
        value: this.pendingDeliveries.length,
        caption: "Aguardando confirmação física",
      },
    ];
  }
  signatureCount(status: string) {
    return this.s
      .data()
      .states.filter(
        (s) =>
          s.signature_status === status && s.reservation_status !== "CANCELLED",
      ).length;
  }
  get pendingDeliveries() {
    return this.s.data().sheets.filter((f) => {
      const state = this.s.state(f.id);
      return (
        state?.receipt_status === "UNCONFIRMED" &&
        state.reservation_status !== "CANCELLED"
      );
    });
  }
  get expiring() {
    return this.s
      .data()
      .products.filter(
        (l) =>
          l.ca_expires_at &&
          new Date(l.ca_expires_at).getTime() < Date.now() + 30 * 86400000,
      ).length;
  }
  get categoryCounts() {
    return [...new Set(this.s.data().products.map((p) => p.category))].map(
      (name) => ({
        name,
        count: this.s.data().products.filter((p) => p.category === name).length,
      }),
    );
  }
  get bars() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      const key = d.toISOString().slice(0, 10);
      const rows = this.s
        .data()
        .movements.filter((m) => m.created_at.startsWith(key));
      return {
        label: d.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
        input: rows
          .filter((r) => r.quantity > 0)
          .reduce((n, r) => n + r.quantity, 0),
        output: -rows
          .filter((r) => r.quantity < 0)
          .reduce((n, r) => n + r.quantity, 0),
      };
    });
  }
  get scale() {
    return 100 / Math.max(1, ...this.bars.flatMap((b) => [b.input, b.output]));
  }
  get input() {
    return this.bars.reduce((n, b) => n + b.input, 0);
  }
  get output() {
    return this.bars.reduce((n, b) => n + b.output, 0);
  }
}
