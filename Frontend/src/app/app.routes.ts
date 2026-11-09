import { type Routes } from "@angular/router";
import { access } from "./core/guards/access.guard";
import { ShellComponent } from "./layout/app-shell/app-shell.component";
const HR = ["ADMIN", "RH", "SEGURANCA_TRABALHO"],
  STOCK = ["ADMIN", "ALMOXARIFADO"];
const dashboard = () =>
  import("./features/dashboard/pages/dashboard/dashboard.page").then(
    (m) => m.DashboardComponent,
  );
const inventory = () =>
  import("./features/almoxarifado/pages/inventory/inventory.page").then(
    (m) => m.InventoryComponent,
  );
const employees = () =>
  import("./features/colaboradores/pages/employees/employees.page").then(
    (m) => m.EmployeesComponent,
  );
const sheets = () =>
  import("./features/fichas-epi/pages/sheets/sheets.page").then(
    (m) => m.SheetsComponent,
  );
export const routes: Routes = [
  {
    path: "login",
    loadComponent: () =>
      import("./features/auth/pages/login/login.page").then(
        (m) => m.LoginComponent,
      ),
  },
  {
    path: "assinar/:token",
    loadComponent: () =>
      import("./features/assinaturas/pages/sign/sign.page").then(
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
        pathMatch: "full",
        redirectTo: "dashboard",
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
        pathMatch: "full",
        redirectTo: "almoxarifado/equipamentos",
      },
      {
        path: "almoxarifado/movimentacoes",
        canActivate: [access],
        data: { roles: STOCK, page: "movements" },
        loadComponent: inventory,
      },
      {
        path: "rh",
        pathMatch: "full",
        redirectTo: "dashboard",
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
        pathMatch: "full",
        redirectTo: "/rh/fichas?status=PENDING",
      },
      {
        path: "rh/kits",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: () =>
          import("./features/fichas-epi/pages/kits/kits.page").then(
            (m) => m.KitsComponent,
          ),
      },
      {
        path: "rh/fichas/nova",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: () =>
          import("./features/fichas-epi/pages/builder/builder.page").then(
            (m) => m.BuilderComponent,
          ),
      },
      {
        path: "rh/fichas/:id/devolucao",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: () =>
          import("./features/fichas-epi/pages/return/return.page").then(
            (m) => m.ReturnComponent,
          ),
      },
      {
        path: "rh/fichas/:id",
        canActivate: [access],
        data: { roles: HR },
        loadComponent: () =>
          import("./features/fichas-epi/pages/detail/detail.page").then(
            (m) => m.DetailComponent,
          ),
      },
      {
        path: "relatorios",
        loadComponent: () =>
          import("./features/relatorios/pages/reports/reports.page").then(
            (m) => m.ReportsComponent,
          ),
      },
      {
        path: "administracao",
        canActivate: [access],
        data: { roles: ["ADMIN"] },
        loadComponent: () =>
          import("./features/administracao/pages/admin/admin.page").then(
            (m) => m.AdminComponent,
          ),
      },
      { path: "", pathMatch: "full", redirectTo: "dashboard" },
    ],
  },
  { path: "**", redirectTo: "dashboard" },
];
