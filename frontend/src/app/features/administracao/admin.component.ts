import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../core/portal.store";
import { roles, roleNames } from "../../core/models";
@Component({
  standalone: true,
  imports: [FormsModule],
  template: `<div class="page-head">
      <div>
        <span class="eyebrow">CONFIGURAÇÕES DA ORGANIZAÇÃO</span>
        <h1>Administração</h1>
        <p>Perfis de acesso e serviços disponíveis.</p>
      </div>
    </div>
    <section class="panel">
      <h2>Usuários e permissões</h2>
      <p class="muted">
        Administradores gerenciam outros usuários. A conta atual não pode
        alterar o próprio perfil.
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            @for (m of members; track m.user_id) {
              <tr>
                <td>{{ m.user_id }}</td>
                <td>
                  <select
                    aria-label="Perfil do usuário"
                    [(ngModel)]="m.role"
                    [disabled]="s.demo"
                  >
                    @for (r of roles; track r) {
                      <option [value]="r">{{ names[r] }}</option>
                    }
                  </select>
                </td>
                <td>
                  <button
                    class="secondary"
                    [disabled]="s.demo || s.busy()"
                    (click)="save(m)"
                  >
                    Salvar perfil
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3" class="empty">Nenhum usuário encontrado.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (s.demo) {
        <p class="note">
          Na demonstração, os perfis são selecionados no login. Nenhum usuário
          real é criado ou alterado.
        </p>
      }
    </section>
    <div class="two-col">
      <section class="panel">
        <h2>FaceMatch</h2>
        <span class="status">Indisponível</span>
        <p class="muted spaced">
          Integração preparada para verificação 1:1. Nenhuma selfie ou biometria
          é coletada. Ativação depende de provedor com prova de vida, avaliação
          de proteção de dados e política de retenção.
        </p>
      </section>
      <section class="panel">
        <h2>Ambiente e documentos</h2>
        <p>
          Modo: <strong>{{ s.demo ? "Demonstração" : "Real" }}</strong>
        </p>
        <p class="muted">
          Modelo de ficha provisório. A fidelidade aos campos amarelos depende
          do PDF original. Quantidade fixa em 1; rubrica por linha, devolução e
          M.D. não aparecem no assistente.
        </p>
        @if (s.demo) {
          <button class="secondary" (click)="s.resetDemo()">
            Restaurar dados fictícios
          </button>
        }
      </section>
    </div>`,
})
export class AdminComponent implements OnInit {
  s = inject(PortalStore);
  roles = roles;
  names = roleNames;
  members: any[] = [];
  ngOnInit() {
    void this.s.action(async () => {
      this.members = this.s.demo
        ? [{ user_id: "visitante@example.invalid", role: this.s.role }]
        : await this.s.request("/api/admin/members");
    }, "");
  }
  save(m: any) {
    void this.s.action(
      () =>
        this.s.request(`/api/admin/members/${m.user_id}`, "PATCH", {
          role: m.role,
        }),
      "Perfil atualizado.",
    );
  }
}
