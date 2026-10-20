import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { PortalStore } from "../../core/portal.store";
import { roles, roleNames, type Role } from "../../core/models";
@Component({
  standalone: true,
  imports: [FormsModule],
  template: `<div class="login-shell">
    <div class="login-art">
      <div class="brand large"><span class="brand-icon">E</span>EPI ERP</div>
      <div>
        <span class="eyebrow">PROTEÇÃO EM CADA ETAPA</span>
        <h1>Pessoas protegidas.<br />Gestão conectada.</h1>
        <p>
          Do estoque à entrega, acompanhe os equipamentos e cuide de quem faz a
          sua empresa acontecer.
        </p>
      </div>
      <div class="art-footer">Almoxarifado · RH · Segurança do Trabalho</div>
    </div>
    <div class="login-form">
      <div class="login-box">
        <span class="eyebrow">{{
          s.demo ? "EXPLORE A PLATAFORMA" : "ACESSO À PLATAFORMA"
        }}</span>
        <h2>
          {{
            recovery
              ? "Nova senha"
              : s.demo
                ? "Conheça o EPI ERP"
                : "Boas-vindas"
          }}
        </h2>
        <p class="muted">
          {{
            s.demo
              ? "Teste os fluxos com dados fictícios, sem precisar de credenciais."
              : "Entre com sua conta autorizada."
          }}
        </p>
        @if (s.failure()) {
          <div class="alert error" role="alert">{{ s.failure() }}</div>
        }
        @if (s.message()) {
          <div class="alert success">{{ s.message() }}</div>
        }
        <form (ngSubmit)="submit()">
          @if (s.demo) {
            <div class="note">
              MODO DEMONSTRAÇÃO · Sem validade jurídica ou acesso a dados reais.
            </div>
            <div class="field">
              <label for="profile">Explorar como</label
              ><select id="profile" name="role" [(ngModel)]="role">
                @for (r of roles; track r) {
                  <option [value]="r">{{ names[r] }}</option>
                }
              </select>
            </div>
          } @else {
            @if (!recovery) {
              <div class="field">
                <label for="email">E-mail corporativo</label
                ><input
                  id="email"
                  name="email"
                  type="email"
                  [(ngModel)]="email"
                  required
                  autocomplete="username"
                />
              </div>
            }
            <div class="field">
              <label for="password">{{
                recovery ? "Nova senha (mínimo 12 caracteres)" : "Senha"
              }}</label
              ><input
                id="password"
                name="password"
                type="password"
                [(ngModel)]="password"
                required
                [autocomplete]="recovery ? 'new-password' : 'current-password'"
              />
            </div>
          }
          <button class="primary wide" [disabled]="s.busy()">
            {{
              s.busy()
                ? "Aguarde…"
                : recovery
                  ? "Salvar nova senha"
                  : s.demo
                    ? "Entrar na demonstração"
                    : "Entrar"
            }}
          </button>
        </form>
        @if (!s.demo && !recovery) {
          <button
            class="text-button spaced"
            (click)="s.action(()=>s.recover(email),'')"
          >
            Esqueci minha senha
          </button>
        }
        <p class="helper">
          {{
            s.demo
              ? "Todas as alterações ficam somente neste navegador."
              : "O administrador concede acesso conforme seu perfil."
          }}
        </p>
      </div>
    </div>
  </div>`,
})
export class LoginComponent {
  s = inject(PortalStore);
  router = inject(Router);
  roles = roles;
  names = roleNames;
  role: Role = "ADMIN";
  email = "";
  password = "";
  recovery = new URLSearchParams(location.search).has("recovery");
  constructor() {
    void this.s.action(() => this.s.init(), "");
  }
  async submit() {
    const ok = await this.s.action(async () => {
      if (this.recovery) {
        await this.s.updatePassword(this.password);
        return;
      }
      await this.s.login(this.email, this.password, this.role);
    }, "");
    if (ok) await this.router.navigateByUrl("/dashboard");
  }
}
