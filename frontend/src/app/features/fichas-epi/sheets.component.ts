import { Component, inject, OnDestroy } from "@angular/core";
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
        <span class="eyebrow">RH / SEGURANÇA DO TRABALHO</span>
        <h1>{{ pendingOnly ? "Assinaturas pendentes" : "Fichas de EPI" }}</h1>
        <p>
          Documentos versionados, assinaturas e entregas acompanhados
          separadamente.
        </p>
      </div>
      <a class="primary button-link" routerLink="/rh/fichas/nova"
        >+ Montar ficha</a
      >
    </div>
    <section class="panel">
      <div class="toolbar">
        <input
          aria-label="Buscar ficha"
          [(ngModel)]="query"
          placeholder="Buscar colaborador ou identificador…"
        /><select aria-label="Filtrar assinatura" [(ngModel)]="status">
          <option value="">Todos os estados</option>
          <option value="PENDING">Pendente</option>
          <option value="SIGNED_MANUAL">Assinada presencialmente</option>
          <option value="SIGNED_ELECTRONIC">Assinada eletronicamente</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Colaborador / ficha</th>
              <th>Emissão</th>
              <th>Versão</th>
              <th>Assinatura</th>
              <th>Entrega física</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            @for (f of sheets; track f.id) {
              <tr>
                <td>
                  <strong>{{
                    s.employee(f.employee_id)?.name || "Colaborador"
                  }}</strong
                  ><br /><small
                    >{{ f.id.slice(0, 12) }} ·
                    {{
                      f.signature_method === "MANUAL"
                        ? "Presencial"
                        : "Por link"
                    }}</small
                  >
                </td>
                <td>{{ f.issued_at | date: "dd/MM/yyyy HH:mm" }}</td>
                <td>v{{ f.version }}</td>
                <td>
                  <epi-status
                    [value]="s.state(f.id)?.signature_status || 'PENDING'"
                  />
                </td>
                <td>
                  <epi-status
                    [value]="
                      s.state(f.id)?.reservation_status === 'CANCELLED'
                        ? 'CANCELLED'
                        : s.state(f.id)?.receipt_status || 'UNCONFIRMED'
                    "
                  />
                </td>
                <td>
                  <a
                    class="secondary button-link"
                    [routerLink]="['/rh/fichas', f.id]"
                    >Ver detalhes</a
                  >
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="empty">
                  Nenhuma ficha encontrada para esses filtros.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="muted small spaced">
        Atualização automática a cada 15 segundos enquanto esta página estiver
        aberta.
      </p>
    </section>`,
})
export class SheetsComponent implements OnDestroy {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  query = "";
  status = "";
  get pendingOnly() {
    return this.route.snapshot.data["pending"] === true;
  }
  employee = this.route.snapshot.queryParamMap.get("employee");
  timer = setInterval(() => {
    if (!document.hidden && !this.s.busy())
      void this.s
        .load()
        .catch(() => this.s.failure.set("Falha ao atualizar as fichas."));
  }, 15000);
  get sheets() {
    return this.s
      .data()
      .sheets.filter(
        (f) =>
          (!this.employee || f.employee_id === this.employee) &&
          `${this.s.employee(f.employee_id)?.name} ${f.id}`
            .toLowerCase()
            .includes(this.query.toLowerCase()) &&
          (!this.status ||
            this.s.state(f.id)?.signature_status === this.status) &&
          (!this.pendingOnly ||
            this.s.state(f.id)?.signature_status === "PENDING"),
      );
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
}
