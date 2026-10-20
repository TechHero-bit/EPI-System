import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../core/portal.store";
import { StatusComponent } from "../../components/status.component";
@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusComponent],
  template: ` <div class="page-head">
      <div>
        <span class="eyebrow">DOCUMENTO VERSIONADO</span>
        <h1>Detalhes da ficha</h1>
        <p>{{ id }}</p>
      </div>
      <a class="secondary button-link" routerLink="/rh/fichas"
        >← Voltar às fichas</a
      >
    </div>
    @if (sheet) {
      <section class="panel">
        <div class="panel-title">
          <h2>
            {{
              sheet.snapshot?.employee?.name ||
                s.employee(sheet.employee_id)?.name
            }}
          </h2>
          <span class="count">Versão {{ sheet.version }}</span>
        </div>
        <div class="detail-meta">
          <span
            >Emitida em {{ sheet.issued_at | date: "dd/MM/yyyy HH:mm" }}</span
          ><epi-status
            [value]="state?.signature_status || 'PENDING'"
          /><epi-status
            [value]="state?.receipt_status || 'UNCONFIRMED'"
          /><epi-status [value]="state?.reservation_status || 'RESERVED'" />
        </div>
        <p class="muted">
          {{
            sheet.snapshot?.employee?.job_title ||
              sheet.snapshot?.employee?.jobTitle
          }}
          · {{ sheet.snapshot?.employee?.department }}
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Equipamento</th>
                <th>CA</th>
                <th>Tamanho</th>
                <th>Lote</th>
                <th>Unidades</th>
              </tr>
            </thead>
            <tbody>
              @for (i of sheet.snapshot?.items || []; track $index) {
                <tr>
                  <td>{{ i.description }}</td>
                  <td>{{ i.ca || "N/A" }}</td>
                  <td>{{ i.size }}</td>
                  <td>{{ i.lot }}</td>
                  <td>1</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="toolbar spaced">
          <button
            class="primary"
            (click)="download('pdf')"
            [disabled]="s.busy()"
          >
            Baixar PDF / imprimir</button
          ><button
            class="secondary"
            (click)="download('xlsx')"
            [disabled]="s.busy()"
          >
            Baixar Excel
          </button>
        </div>
        <p class="note">
          Modelo provisório. Fichas emitidas preservam o conteúdo e a versão
          exatos. Retificações exigem uma nova emissão e um evento de auditoria.
        </p>
        <small class="hash">SHA-256: {{ sheet.pdf_sha256 }}</small>
      </section>
      <div class="two-col">
        <section class="panel">
          <h2>
            Assinatura
            {{
              sheet.signature_method === "MANUAL" ? "presencial" : "eletrônica"
            }}
          </h2>
          @if (
            state?.signature_status === "PENDING" &&
            state?.reservation_status !== "CANCELLED"
          ) {
            @if (sheet.signature_method === "MANUAL") {
              <label class="field"
                >Local de arquivo do original assinado<textarea
                  [(ngModel)]="signatureNote"
                  maxlength="500"
                  placeholder="Informe responsável, data e referência do arquivo"
                ></textarea></label
              ><button
                class="primary"
                [disabled]="s.busy() || !signatureNote.trim()"
                (click)="manual()"
              >
                Registrar assinatura presencial
              </button>
              @if (!s.demo) {
                <label class="field spaced"
                  >Documento físico digitalizado (PDF, até 5 MB)<input
                    type="file"
                    accept="application/pdf"
                    (change)="attach($event)"
                /></label>
              }
            } @else {
              <p class="muted">
                O link requer código enviado ao e-mail pessoal previamente
                verificado.
              </p>
              <button class="primary" (click)="link()" [disabled]="s.busy()">
                {{
                  s.demo ? "Criar link de simulação" : "Criar link individual"
                }}
              </button>
              @if (url) {
                <div class="copy-row spaced">
                  <input
                    aria-label="Link de assinatura"
                    readonly
                    [value]="url"
                  /><button class="secondary" (click)="copy()">Copiar</button>
                </div>
                <a
                  [href]="url"
                  target="_blank"
                  rel="noopener"
                  class="text-button"
                  >Abrir {{ s.demo ? "simulação" : "link" }}</a
                >
              }
            }
          } @else {
            <p class="muted">
              {{
                state?.reservation_status === "CANCELLED"
                  ? "Reserva cancelada."
                  : "A assinatura já está registrada nesta versão."
              }}
            </p>
          }
        </section>
        <section class="panel">
          <h2>Entrega física</h2>
          <p class="muted">
            Somente confirme após entregar efetivamente os EPIs. Esta ação baixa
            as unidades reservadas.
          </p>
          @if (
            state?.receipt_status !== "CONFIRMED" &&
            state?.reservation_status !== "CANCELLED"
          ) {
            <label class="field"
              >Evidência da entrega presencial<textarea
                [(ngModel)]="receiptNote"
                maxlength="500"
                placeholder="Quem recebeu, quem entregou e observações"
              ></textarea></label
            ><button
              class="primary"
              [disabled]="s.busy() || !receiptNote.trim()"
              (click)="receipt()"
            >
              Confirmar entrega física
            </button>
            <div class="spaced">
              <label class="field"
                >Motivo do cancelamento<input
                  [(ngModel)]="cancelNote"
                  maxlength="500" /></label
              ><button
                class="secondary"
                [disabled]="s.busy() || cancelNote.trim().length < 5"
                (click)="cancel()"
              >
                Cancelar reserva e liberar itens
              </button>
            </div>
          } @else {
            <epi-status
              [value]="
                state?.reservation_status === 'CANCELLED'
                  ? 'CANCELLED'
                  : 'CONFIRMED'
              "
            />
          }
        </section>
      </div>
      <section class="panel">
        <h2>Histórico da ficha</h2>
        @for (a of audits; track a.id) {
          <div class="activity">
            <div>
              <strong>{{ a.action }}</strong
              ><small>{{ a.created_at | date: "dd/MM/yyyy HH:mm:ss" }}</small>
            </div>
          </div>
        } @empty {
          <p class="empty">Sem eventos adicionais nesta consulta.</p>
        }
      </section>
    } @else {
      <section class="panel empty">
        {{ s.busy() ? "Carregando ficha…" : "Ficha não encontrada." }}
      </section>
    }`,
})
export class DetailComponent implements OnInit, OnDestroy {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get("id")!;
  sheet: any;
  signatureNote = "";
  receiptNote = "";
  cancelNote = "";
  url = "";
  timer?: ReturnType<typeof setInterval>;
  get state() {
    return this.s.state(this.id);
  }
  get audits() {
    return this.s.data().audits.filter((a) => a.entity_id === this.id);
  }
  async ngOnInit() {
    await this.s.action(async () => {
      this.sheet = await this.s.sheet(this.id);
    }, "");
    this.timer = setInterval(() => {
      if (!document.hidden) void this.s.load().catch(() => {});
    }, 15000);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  download(kind: "pdf" | "xlsx") {
    void this.s.action(() => this.s.download(this.id, kind), "");
  }
  manual() {
    void this.s.action(
      () => this.s.manual(this.id, this.signatureNote),
      "Registro presencial concluído.",
    );
  }
  receipt() {
    void this.s.action(
      () => this.s.receipt(this.id, this.receiptNote),
      "Entrega confirmada e estoque atualizado.",
    );
  }
  cancel() {
    void this.s.action(
      () => this.s.cancel(this.id, this.cancelNote),
      "Reserva cancelada.",
    );
  }
  link() {
    void this.s.action(async () => {
      this.url = await this.s.signingLink(this.id);
    }, "");
  }
  copy() {
    void this.s.action(
      () => navigator.clipboard.writeText(this.url),
      "Link copiado.",
    );
  }
  attach(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void this.s.action(async () => {
      if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024)
        throw new Error("Use um PDF de até 5 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await this.s.request(`/api/sheets/${this.id}/attachment`, "POST", {
        content: btoa(binary),
      });
    }, "Documento digitalizado anexado ao bucket privado.");
  }
}
