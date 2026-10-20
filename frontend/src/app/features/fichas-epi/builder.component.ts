import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { PortalStore } from "../../core/portal.store";
import { today, type DraftItem } from "../../core/models";
@Component({
  standalone: true,
  imports: [FormsModule],
  template: ` <div class="page-head">
      <div>
        <span class="eyebrow">FICHAS DE EPI</span>
        <h1>Uma ficha. Cada proteção.</h1>
        <p>
          Selecione os equipamentos por cartões. Cada seleção adiciona uma
          unidade.
        </p>
      </div>
      <span class="date-pill">Etapa {{ step }} de 3</span>
    </div>
    <div class="stepper">
      <button [class.active]="step === 1" (click)="step = 1">
        1 · Colaborador</button
      ><button
        [class.active]="step === 2"
        [disabled]="!employeeId"
        (click)="step = 2"
      >
        2 · Equipamentos</button
      ><button
        [class.active]="step === 3"
        [disabled]="!draft.length"
        (click)="step = 3"
      >
        3 · Revisão e emissão
      </button>
    </div>
    <div class="builder">
      <div>
        @if (step === 1) {
          <section class="panel">
            <h2>Para quem vamos preparar a ficha?</h2>
            <input
              aria-label="Buscar colaborador"
              [(ngModel)]="employeeQuery"
              placeholder="Buscar por nome ou matrícula…"
            />
            <div class="people-picker">
              @for (e of employees; track e.id) {
                <button
                  class="person-option"
                  [class.selected]="employeeId === e.id"
                  (click)="employeeId = e.id"
                >
                  <span class="avatar">{{ e.name.slice(0, 1) }}</span
                  ><span
                    ><strong>{{ e.name }}</strong
                    ><small
                      >{{ e.registration }} · {{ e.job_title }} ·
                      {{ e.department }}</small
                    ></span
                  ><span>{{ employeeId === e.id ? "✓" : "+" }}</span>
                </button>
              } @empty {
                <div class="empty">Nenhum colaborador ativo encontrado.</div>
              }
            </div>
            <button class="primary" [disabled]="!employeeId" (click)="step = 2">
              Escolher equipamentos →
            </button>
          </section>
        }
        @if (step === 2) {
          <section class="panel">
            <h2>Escolha os equipamentos e tamanhos</h2>
            <div class="toolbar">
              <input
                aria-label="Buscar equipamento"
                [(ngModel)]="query"
                placeholder="Buscar nome, CA ou tamanho…"
              /><select aria-label="Categoria" [(ngModel)]="category">
                <option value="">Todas as categorias</option>
                @for (c of categories; track c) {
                  <option>{{ c }}</option>
                }
              </select>
            </div>
            <div class="equipment-grid">
              @for (v of variants; track v.id) {
                <button
                  class="equipment-card"
                  [disabled]="!available(v.id)"
                  (click)="add(v)"
                >
                  <strong>{{ s.product(v.product_id)?.description }}</strong
                  ><small
                    >CA {{ s.product(v.product_id)?.ca || "N/A" }} · Tam.
                    {{ v.size }}</small
                  ><span class="stock-tag" [class.out]="!available(v.id)"
                    >{{ available(v.id) }} disponíveis · + 1 un.</span
                  >
                </button>
              } @empty {
                <div class="empty">Nenhum equipamento encontrado.</div>
              }
            </div>
            <button
              class="primary spaced"
              [disabled]="!draft.length"
              (click)="step = 3"
            >
              Revisar seleção →
            </button>
          </section>
        }
        @if (step === 3) {
          <section class="panel">
            <h2>Revisar e gerar ficha</h2>
            <p>
              <strong>{{ s.employee(employeeId)?.name }}</strong
              ><br />{{ s.employee(employeeId)?.job_title }} ·
              {{ s.employee(employeeId)?.department }}
            </p>
            <label class="field"
              >Data prevista / indicada pelo RH<input
                type="date"
                [(ngModel)]="date" /></label
            ><label class="field"
              >Método de assinatura<select [(ngModel)]="method">
                <option value="MANUAL">Presencial / documento impresso</option>
                <option value="ELECTRONIC">Eletrônica por link + código</option>
              </select></label
            >
            <div class="note">
              A emissão reserva os equipamentos. A assinatura remota mantém a
              entrega física pendente; a baixa ocorre na confirmação presencial.
            </div>
            <p class="muted small">
              Modelo provisório configurável. O PDF original com os campos
              amarelos ainda é necessário para validar a fidelidade. Não há
              rubrica por linha, devolução, M.D. ou campo de quantidade
              editável.
            </p>
            <button
              class="primary wide"
              [disabled]="s.busy() || !draft.length || !employeeId || !date"
              (click)="issue()"
            >
              {{
                s.busy()
                  ? "Gerando…"
                  : s.demo
                    ? "Gerar ficha demonstrativa"
                    : "Gerar ficha e reservar EPIs"
              }}
            </button>
          </section>
        }
      </div>
      <aside class="panel builder-summary">
        <div class="panel-title">
          <h2>Seleção da ficha</h2>
          <span class="count">{{ draft.length }} itens</span>
        </div>
        @for (item of draft; track $index) {
          <div class="draft-item">
            <div>
              <strong>{{
                s.product(s.variant(item.variantId)?.product_id)?.description
              }}</strong
              ><small
                >Tamanho {{ s.variant(item.variantId)?.size }} · 1
                unidade</small
              ><label
                >Lote<select
                  [(ngModel)]="item.lotId"
                  aria-label="Selecionar lote"
                >
                  @for (l of validLots(item.variantId); track l.id) {
                    <option [value]="l.id">
                      {{ l.batch_code }} · {{ s.available(l) }} disponíveis
                    </option>
                  }
                </select></label
              >
            </div>
            <button
              class="remove"
              (click)="draft.splice($index, 1)"
              aria-label="Remover item"
            >
              ×
            </button>
          </div>
        } @empty {
          <div class="empty">Os equipamentos selecionados aparecerão aqui.</div>
        }
        <div class="summary-footer">
          <span>Quantidade fixa: 1 unidade por linha</span
          ><small
            >Os campos vermelhos do documento original não fazem parte da
            montagem.</small
          >
        </div>
      </aside>
    </div>`,
})
export class BuilderComponent {
  s = inject(PortalStore);
  router = inject(Router);
  employeeId = "";
  employeeQuery = "";
  query = "";
  category = "";
  step = 1;
  date = today();
  method = "MANUAL";
  draft: DraftItem[] = [];
  key = crypto.randomUUID();
  get employees() {
    return this.s
      .data()
      .employees.filter(
        (e) =>
          !e.termination_date &&
          `${e.name} ${e.registration}`
            .toLowerCase()
            .includes(this.employeeQuery.toLowerCase()),
      );
  }
  get categories() {
    return [...new Set(this.s.data().products.map((p) => p.category))];
  }
  get variants() {
    return this.s.data().variants.filter((v) => {
      const p = this.s.product(v.product_id);
      return (
        p?.active &&
        (!this.category || p.category === this.category) &&
        `${p.description} ${p.ca} ${v.size}`
          .toLowerCase()
          .includes(this.query.toLowerCase())
      );
    });
  }
  validLots(id: string) {
    return this.s
      .data()
      .lots.filter(
        (l) =>
          l.variant_id === id &&
          this.s.available(l) > 0 &&
          (!l.expires_at || l.expires_at >= today()) &&
          l.condition !== "AVARIADO",
      );
  }
  available(id: string) {
    const p = this.s.product(this.s.variant(id)?.product_id);
    if (p?.ca_expires_at && p.ca_expires_at < today()) return 0;
    return this.validLots(id).reduce(
      (n, l) =>
        n +
        this.s.available(l) -
        this.draft.filter((i) => i.lotId === l.id).length,
      0,
    );
  }
  add(v: any) {
    if (this.draft.length >= 15) {
      this.s.failure.set("Limite de 15 itens por ficha.");
      return;
    }
    const l = this.validLots(v.id).find(
      (l) =>
        this.s.available(l) > this.draft.filter((i) => i.lotId === l.id).length,
    );
    if (!l) return;
    this.draft.push({
      variantId: v.id,
      lotId: l.id,
      quantity: 1,
      risk: this.s.product(v.product_id)?.risk_code ?? "",
    });
  }
  async issue() {
    await this.s.action(async () => {
      const value = await this.s.issue(
        this.employeeId,
        this.draft,
        this.method,
        this.date,
        this.key,
      );
      await this.router.navigate(["/rh/fichas", value.id]);
    }, "Ficha gerada. Os itens foram reservados.");
  }
}
