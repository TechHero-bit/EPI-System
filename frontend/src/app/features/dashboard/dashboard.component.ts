import { Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { PortalStore } from "../../core/portal.store";
import { StatusComponent } from "../../components/status.component";
@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, StatusComponent],
  template: ` <div class="page-head">
      <div>
        <span class="eyebrow">PAINEL OPERACIONAL</span>
        <h1>{{ title }}</h1>
        <p>As informações que conectam proteção, pessoas e estoque.</p>
      </div>
      <span class="date-pill">{{ date | date: "dd/MM/yyyy" }}</span>
    </div>
    <div class="stats">
      <div class="stat">
        <div class="stat-icon blue">▣</div>
        <span>Equipamentos</span><strong>{{ s.data().products.length }}</strong
        ><small>{{ low }} variações em estoque baixo</small>
      </div>
      <div class="stat">
        <div class="stat-icon mint">♙</div>
        <span>Colaboradores ativos</span><strong>{{ active }}</strong
        ><small>Na sua organização</small>
      </div>
      <div class="stat">
        <div class="stat-icon amber">✎</div>
        <span>Assinaturas pendentes</span><strong>{{ pending }}</strong
        ><small>{{ s.data().sheets.length }} fichas emitidas</small>
      </div>
      <div class="stat">
        <div class="stat-icon coral">⇄</div>
        <span>Entregas pendentes</span><strong>{{ deliveries }}</strong
        ><small>Confirmação física independente</small>
      </div>
    </div>
    <div class="two-col">
      <section class="panel hero-panel">
        <span class="eyebrow">CUIDADO QUE SE TRANSFORMA EM AÇÃO</span>
        <h2>O próximo EPI, na ficha certa.</h2>
        <p>
          Escolha o colaborador, selecione os equipamentos e acompanhe cada
          etapa da entrega.
        </p>
        @if (s.role !== "ALMOXARIFADO") {
          <a class="light-button button-link" routerLink="/rh/fichas/nova"
            >Montar nova ficha →</a
          >
        } @else {
          <a class="light-button button-link" routerLink="/almoxarifado/estoque"
            >Conferir estoque →</a
          >
        }
      </section>
      <section class="panel">
        <div class="panel-title">
          <h2>Entradas e saídas · últimos 7 dias</h2>
        </div>
        <div class="chart" aria-label="Gráfico de movimentações">
          @for (bar of bars; track bar.label) {
            <div class="chart-column">
              <div class="bar-pair">
                <div
                  class="bar in"
                  [style.height.px]="bar.input * scale + 3"
                  [title]="'Entradas: ' + bar.input"
                ></div>
                <div
                  class="bar out"
                  [style.height.px]="bar.output * scale + 3"
                  [title]="'Saídas: ' + bar.output"
                ></div>
              </div>
              <small>{{ bar.label }}</small>
            </div>
          }
        </div>
        <div class="legend">
          <span>● Entradas {{ input }}</span
          ><span>● Saídas {{ output }}</span>
        </div>
      </section>
    </div>
    <div class="two-col">
      <section class="panel">
        <div class="panel-title">
          <h2>Atenção ao estoque</h2>
          <a routerLink="/almoxarifado/estoque" class="text-button">Conferir</a>
        </div>
        @for (v of lows; track v.id) {
          <div class="activity">
            <span class="activity-icon">!</span>
            <div>
              <strong>{{ s.product(v.product_id)?.description }}</strong
              ><small
                >Tamanho {{ v.size }} · mínimo {{ v.minimum_stock }}</small
              >
            </div>
            <span class="status">{{ s.stock(v.id) }} disponíveis</span>
          </div>
        } @empty {
          <div class="empty">Nenhum item abaixo do mínimo.</div>
        }
        <p class="note">
          {{ expiring }} lotes vencidos ou com vencimento nos próximos 30 dias.
          Validade do produto, do CA e prazo de utilização são informações
          distintas.
        </p>
      </section>
      <section class="panel">
        <div class="panel-title">
          <h2>Atividade recente</h2>
          <a class="text-button" routerLink="/relatorios">Ver histórico</a>
        </div>
        @for (m of s.data().movements.slice(0, 5); track m.id) {
          <div class="activity">
            <span class="activity-icon">⇄</span>
            <div>
              <strong>{{ m.reason || "Movimentação de EPI" }}</strong
              ><small
                >{{ m.created_at | date: "dd/MM HH:mm" }} ·
                {{ m.quantity }} un.</small
              >
            </div>
            <epi-status [value]="m.type" />
          </div>
        } @empty {
          <div class="empty">As movimentações aparecerão aqui.</div>
        }
      </section>
    </div>
    <section class="panel">
      <h2>Equipamentos por categoria</h2>
      <div class="category-metrics">
        @for (c of categoryCounts; track c.name) {
          <div>
            <strong>{{ c.count }}</strong
            ><span>{{ c.name }}</span>
          </div>
        }
      </div>
    </section>`,
})
export class DashboardComponent {
  s = inject(PortalStore);
  date = new Date();
  get title() {
    return location.pathname === "/rh"
      ? "Pessoas e segurança"
      : location.pathname === "/almoxarifado"
        ? "Seu estoque sob controle"
        : "Visão geral";
  }
  get active() {
    return this.s.data().employees.filter((e) => !e.termination_date).length;
  }
  get lows() {
    return this.s
      .data()
      .variants.filter((v) => this.s.stock(v.id) <= v.minimum_stock);
  }
  get low() {
    return this.lows.length;
  }
  get pending() {
    return this.s
      .data()
      .states.filter(
        (s) =>
          s.signature_status === "PENDING" &&
          s.reservation_status !== "CANCELLED",
      ).length;
  }
  get deliveries() {
    return this.s
      .data()
      .states.filter(
        (s) =>
          s.receipt_status === "UNCONFIRMED" &&
          s.reservation_status !== "CANCELLED",
      ).length;
  }
  get expiring() {
    return this.s
      .data()
      .lots.filter(
        (l) =>
          l.expires_at &&
          new Date(l.expires_at).getTime() < Date.now() + 30 * 86400000,
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
