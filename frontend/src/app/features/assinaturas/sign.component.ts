import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { PortalStore } from "../../core/portal.store";
@Component({
  standalone: true,
  imports: [FormsModule],
  template: `<div class="sign-shell">
    <section class="sign-card">
      <div class="brand"><span class="brand-icon">E</span>EPI ERP</div>
      <span class="eyebrow">PORTAL DO COLABORADOR</span>
      <h1>
        {{ s.demo ? "Simulação de assinatura" : "Assinatura da ficha de EPI" }}
      </h1>
      <p class="muted">
        A assinatura e a entrega física são registradas separadamente.
      </p>
      @if (s.demo) {
        <div class="note">
          DEMONSTRAÇÃO · Sem mensagens reais e sem validade jurídica.
        </div>
      }
      @if (s.failure()) {
        <div class="alert error" role="alert">{{ s.failure() }}</div>
      }
      @if (s.message()) {
        <div class="alert success">{{ s.message() }}</div>
      }
      @if (done) {
        <div class="success-panel">
          <span class="big-check">✓</span>
          <h2>
            {{ s.demo ? "Simulação concluída" : "Assinatura registrada" }}
          </h2>
          <p>A entrega física continua pendente de confirmação separada.</p>
        </div>
      } @else {
        <button
          class="primary wide"
          [disabled]="s.busy()"
          (click)="requestCode()"
        >
          {{
            s.demo
              ? "Iniciar simulação"
              : sent
                ? "Reenviar código"
                : "Enviar código de verificação"
          }}
        </button>
        @if (sent) {
          @if (!s.demo) {
            <label class="field spaced"
              >Código de 6 dígitos<input
                [(ngModel)]="code"
                maxlength="6"
                inputmode="numeric"
                autocomplete="one-time-code"
            /></label>
          }
          <button
            class="secondary wide spaced"
            [disabled]="s.busy() || (!s.demo && code.length !== 6)"
            (click)="preview()"
          >
            Conferir documento
          </button>
        }
        @if (previewData) {
          <div class="preview-block">
            @if (s.demo) {
              <p>
                <strong>{{ previewData.sheet.snapshot.employee.name }}</strong>
              </p>
              <ul>
                @for (i of previewData.sheet.snapshot.items; track $index) {
                  <li>{{ i.description }} · {{ i.size }} · 1 un.</li>
                }
              </ul>
              <button class="secondary wide" (click)="download()">
                Ver PDF demonstrativo
              </button>
            } @else {
              <a
                class="secondary button-link"
                [href]="previewData.documentUrl"
                target="_blank"
                rel="noopener"
                >Abrir PDF exato (link válido por 60 s)</a
              >
            }
            <code>{{ previewData.sha256 }}</code
            ><label class="checkline"
              ><input type="checkbox" [(ngModel)]="accepted" /><span>{{
                previewData.terms
              }}</span></label
            ><button
              class="primary wide"
              [disabled]="s.busy() || !accepted"
              (click)="confirm()"
            >
              {{ s.demo ? "Simular aceite" : "Assinar eletronicamente" }}
            </button>
          </div>
        }
      }
    </section>
  </div>`,
})
export class SignComponent implements OnInit {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  token = this.route.snapshot.paramMap.get("token")!;
  sent = false;
  code = "";
  previewData: any;
  accepted = false;
  done = false;
  ngOnInit() {
    void this.s.action(async () => {
      await this.s.init();
      await this.s.publicAction(this.token, "");
    }, "");
  }
  requestCode() {
    void this.s.action(
      async () => {
        await this.s.publicAction(this.token, "code", {});
        this.sent = true;
      },
      this.s.demo
        ? "Simulação iniciada."
        : "Código enviado ao e-mail previamente verificado.",
    );
  }
  preview() {
    void this.s.action(async () => {
      this.previewData = await this.s.publicAction(this.token, "preview", {
        code: this.code,
      });
    }, "");
  }
  confirm() {
    void this.s.action(async () => {
      await this.s.publicAction(this.token, "confirm", {
        code: this.code,
        acceptedTerms: this.accepted,
      });
      this.done = true;
    }, "");
  }
  download() {
    void this.s.action(
      () => this.s.download(this.previewData.sheet.id, "pdf"),
      "",
    );
  }
}
