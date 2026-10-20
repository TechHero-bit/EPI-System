import { inject } from "@angular/core";
import { Router, type CanActivateFn, type Routes } from "@angular/router";
import { PortalStore } from "./core/portal.store";
import { ShellComponent } from "./layouts/shell.component";
const access: CanActivateFn = async (route) => {
  const s = inject(PortalStore),
    router = inject(Router);
  try {
    await s.init();
  } catch (e) {
    s.failure.set(e instanceof Error ? e.message : "Conexão indisponível.");
    return router.parseUrl("/login");
  }
  if (!s.user()) return router.parseUrl("/login");
  const roles = route.data["roles"] as string[] | undefined;
  if (roles && !roles.includes(s.role)) {
    s.failure.set("Seu perfil não tem acesso a esta página.");
    return router.parseUrl("/dashboard");
  }
  return true;
};
const HR = ["ADMIN", "RH", "SEGURANCA_TRABALHO"],
  STOCK = ["ADMIN", "ALMOXARIFADO"];
const dashboard = () =>
  import("./features/dashboard/dashboard.component").then(
    (m) => m.DashboardComponent,
  );
const inventory = () =>
  import("./features/almoxarifado/inventory.component").then(
    (m) => m.InventoryComponent,
  );
const employees = () =>
  import("./features/colaboradores/employees.component").then(
    (m) => m.EmployeesComponent,
  );
const sheets = () =>
  import("./features/fichas-epi/sheets.component").then(
    (m) => m.SheetsComponent,
  );
export const routes: Routes = [
  {
    path: "login",
    loadComponent: () =>
      import("./features/auth/login.component").then((m) => m.LoginComponent),
  },
  {
    path: "assinar/:token",
    loadComponent: () =>
      import("./features/assinaturas/sign.component").then(
        (m) => m.SignComponent,
      ),
  },
  {
    path: "",
    component: ShellComponent,
    canActivate: [access],
    children: [
      { path: "dashboard", loadComponent: dashboard },
      {
        path: "almoxarifado",
        canActivate: [access],
        data: { roles: STOCK },
        loadComponent: dashboard,
      },
      {
        path: "almoxarifado/equipamentos",
        canActivate: [access],
        data: { roles: STOCK, page: "catalog" },
        loadComponent: inventory,
      },
      {
        path: "almoxarifado/equipamentos/novo",
        canActivate: [access],
        data: { roles: STOCK, page: "new" },
        loadComponent: inventory,
      },
      {
        path: "almoxarifado/estoque",
        canActivate: [access],
        data: { roles: STOCK, page: "stock" },
        loadComponent: inventory,
      },
      {
        path: "almoxarifado/movimentacoes",
        canActivate: [access],
        data: { roles: STOCK, page: "movements" },
        loadComponent: inventory,
      },
      {
        path: "rh",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: dashboard,
      },
      {
        path: "rh/colaboradores",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: employees,
      },
      {
        path: "rh/colaboradores/novo",
        canActivate: [access],
        data: { roles: HR, page: "new" },
        loadComponent: employees,
      },
      {
        path: "rh/fichas",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: sheets,
      },
      {
        path: "rh/assinaturas",
        canActivate: [access],
        data: { roles: HR, pending: true },
        loadComponent: sheets,
      },
      {
        path: "rh/fichas/nova",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: () =>
          import("./features/fichas-epi/builder.component").then(
            (m) => m.BuilderComponent,
          ),
      },
      {
        path: "rh/fichas/:id",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: () =>
          import("./features/fichas-epi/detail.component").then(
            (m) => m.DetailComponent,
          ),
      },
      {
        path: "relatorios",
        loadComponent: () =>
          import("./features/relatorios/reports.component").then(
            (m) => m.ReportsComponent,
          ),
      },
      {
        path: "administracao",
        canActivate: [access],
        data: { roles: ["ADMIN"] },
        loadComponent: () =>
          import("./features/administracao/admin.component").then(
            (m) => m.AdminComponent,
          ),
      },
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
    ],
  },
  { path: "**", redirectTo: "dashboard" },
];
