import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../core/portal.store";
import { today } from "../../core/models";
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  template: ` <div class="page-head">
      <div>
        <span class="eyebrow">RH / SEGURANÇA DO TRABALHO</span>
        <h1>{{ isNew ? "Cadastrar colaborador" : "Colaboradores" }}</h1>
        <p>Cadastros, histórico e vínculo com as fichas de proteção.</p>
      </div>
      @if (!isNew) {
        <a class="primary button-link" routerLink="/rh/colaboradores/novo"
          >+ Novo colaborador</a
        >
      }
    </div>
    @if (isNew || editing) {
      <section class="panel">
        <h2>{{ editing ? "Editar cadastro" : "Dados do colaborador" }}</h2>
        <form (ngSubmit)="save()">
          <div class="form-grid">
            <label class="field"
              >Nome completo<input
                name="name"
                [(ngModel)]="form.name"
                required
                maxlength="160" /></label
            ><label class="field"
              >Matrícula<input
                name="registration"
                [(ngModel)]="form.registration"
                required
                maxlength="50" /></label
            ><label class="field"
              >CPF (opcional, acesso restrito ao RH)<input
                name="cpf"
                [(ngModel)]="form.cpf"
                inputmode="numeric"
                maxlength="14" /></label
            ><label class="field"
              >Cargo / função<input
                name="job"
                [(ngModel)]="form.jobTitle"
                required /></label
            ><label class="field"
              >Departamento / setor<input
                name="department"
                [(ngModel)]="form.department" /></label
            ><label class="field"
              >Unidade de trabalho<input
                name="unit"
                [(ngModel)]="form.workUnit" /></label
            ><label class="field"
              >E-mail pessoal<input
                name="email"
                type="email"
                [(ngModel)]="form.personalEmail" /></label
            ><label class="field"
              >Telefone<input
                name="phone"
                type="tel"
                [(ngModel)]="form.phone" /></label
            ><label class="field"
              >Admissão<input
                name="admission"
                type="date"
                [(ngModel)]="form.admissionDate"
                required /></label
            ><label class="field"
              >Desligamento (quando houver)<input
                name="termination"
                type="date"
                [(ngModel)]="form.terminationDate"
            /></label>
          </div>
          <fieldset class="facial-choice">
            <legend>Cadastrar reconhecimento facial?</legend>
            <label
              ><input
                type="radio"
                name="face"
                [value]="false"
                [(ngModel)]="form.facialOptIn"
              />
              Não, continuar sem reconhecimento facial.</label
            ><label
              ><input
                type="radio"
                name="face"
                [value]="true"
                [(ngModel)]="form.facialOptIn"
              />
              Sim, tenho interesse em cadastrar a facial quando
              disponível.</label
            >
            <p class="note">
              FaceMatch indisponível. A preferência não autoriza coleta nem
              registra biometria. O cadastro e a assinatura continuam
              disponíveis sem facial.
            </p>
          </fieldset>
          <button class="primary" [disabled]="s.busy()">
            Salvar colaborador
          </button>
        </form>
      </section>
    }
    @if (!isNew) {
      <section class="panel">
        <div class="toolbar">
          <input
            aria-label="Buscar colaborador"
            [(ngModel)]="query"
            placeholder="Buscar nome, matrícula ou setor…"
          /><select aria-label="Situação" [(ngModel)]="status">
            <option value="">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Cargo / setor</th>
                <th>Admissão</th>
                <th>Situação</th>
                <th>Fichas</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (e of employees; track e.id) {
                <tr>
                  <td>
                    <strong>{{ e.name }}</strong
                    ><br /><small
                      >{{ e.registration }} · {{ e.work_unit }}</small
                    >
                  </td>
                  <td>
                    {{ e.job_title }}<br /><small>{{ e.department }}</small>
                  </td>
                  <td>{{ e.admission_date | date: "dd/MM/yyyy" }}</td>
                  <td>
                    <span class="status" [class.ok]="!e.termination_date">{{
                      e.termination_date ? "Inativo" : "Ativo"
                    }}</span>
                  </td>
                  <td>
                    <a
                      routerLink="/rh/fichas"
                      [queryParams]="{ employee: e.id }"
                      >{{ sheetCount(e.id) }} fichas</a
                    >
                  </td>
                  <td>
                    <button class="secondary" (click)="edit(e)">Editar</button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="empty">
                    Nenhum colaborador encontrado.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
    @if (!s.demo) {
      <section class="panel">
        <h2>Verificar e-mail pessoal</h2>
        <p class="muted">
          Confirme a titularidade do endereço com o colaborador por procedimento
          independente antes de enviar o código.
        </p>
        <label class="field"
          >Colaborador<select [(ngModel)]="verificationId">
            <option value="">Selecionar</option>
            @for (e of s.data().employees; track e.id) {
              <option [value]="e.id">
                {{ e.name }} ·
                {{ e.email_verified_at ? "Verificado" : "Pendente" }}
              </option>
            }
          </select></label
        ><button
          class="secondary"
          (click)="sendCode()"
          [disabled]="s.busy() || !verificationId"
        >
          Enviar código
        </button>
        <div class="toolbar spaced">
          <input
            aria-label="Código de verificação"
            [(ngModel)]="code"
            maxlength="6"
            inputmode="numeric"
            placeholder="Código recebido"
          /><button
            class="primary"
            (click)="verify()"
            [disabled]="s.busy() || code.length !== 6"
          >
            Confirmar e-mail
          </button>
        </div>
      </section>
    }`,
})
export class EmployeesComponent {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  get isNew() {
    return this.route.snapshot.data["page"] === "new";
  }
  query = "";
  status = "";
  editing = "";
  verificationId = "";
  code = "";
  form: any = {
    name: "",
    registration: "",
    cpf: "",
    jobTitle: "",
    department: "",
    admissionDate: today(),
    terminationDate: null,
    personalEmail: "",
    phone: "",
    workUnit: "",
    facialOptIn: false,
  };
  get employees() {
    return this.s
      .data()
      .employees.filter(
        (e) =>
          `${e.name} ${e.registration} ${e.department}`
            .toLowerCase()
            .includes(this.query.toLowerCase()) &&
          (!this.status ||
            (this.status === "inactive") === !!e.termination_date),
      );
  }
  sheetCount(id: string) {
    return this.s.data().sheets.filter((s) => s.employee_id === id).length;
  }
  edit(e: any) {
    this.editing = e.id;
    this.form = {
      name: e.name,
      registration: e.registration,
      jobTitle: e.job_title,
      department: e.department,
      admissionDate: e.admission_date,
      terminationDate: e.termination_date,
      personalEmail: e.personal_email,
      phone: e.phone,
      workUnit: e.work_unit,
      facialOptIn: e.facial_opt_in,
      cpf: e.cpf ?? "",
    };
  }
  async save() {
    await this.s.action(
      () =>
        this.s.saveEmployee(
          {
            ...this.form,
            personalEmail: this.form.personalEmail || null,
            terminationDate: this.form.terminationDate || null,
            cpf: this.form.cpf || null,
          },
          this.editing || undefined,
        ),
      "Colaborador salvo.",
    );
  }
  sendCode() {
    void this.s.action(
      () =>
        this.s.request(
          `/api/employees/${this.verificationId}/send-verification`,
          "POST",
          {},
        ),
      "Código enviado.",
    );
  }
  verify() {
    void this.s.action(async () => {
      await this.s.request(
        "/api/verify-email",
        "POST",
        { employeeId: this.verificationId, code: this.code },
        false,
      );
      await this.s.load();
    }, "E-mail verificado.");
  }
}
