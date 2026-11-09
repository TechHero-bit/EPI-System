import { Component, inject } from "@angular/core";
import { alphabetical } from "../../../../shared/utils/alphabetical";
import { FormsModule } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { RETURNABLE_RESERVATION_STATUS } from "../../../../../../../contracts/returns.mjs";
import { PortalStore } from "../../../../core/services/portal.service";
import { today } from "../../../../core/models/portal.model";
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: "./employees.page.html",
})
export class EmployeesComponent {
  get employeeOptions() {
    return alphabetical(this.s.data().employees, (e) => e.name);
  }
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  /** Popup após informar a data de desligamento. */
  terminated: { employee: any; sheet: any } | null = null;
  get isNew() {
    return this.route.snapshot.data["page"] === "new";
  }
  query = "";
  status = "";
  clientFilter = "";
  unitFilter = "";
  racFilter = "";
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
    clientId: "",
    workUnitId: "",
    racIds: [] as string[],
  };
  /** Itens ativos da lista e, na edição, o item já vinculado mesmo se inativo. */
  options(key: "clients" | "workUnits" | "racs", current: string[] = []) {
    return alphabetical(
      ((this.s.data()[key] ?? []) as any[]).filter(
        (row) => row.active || current.includes(row.id),
      ),
      (row) => row.name,
    );
  }
  allOptions(key: "clients" | "workUnits" | "racs") {
    return alphabetical((this.s.data()[key] ?? []) as any[], (row) => row.name);
  }
  toggleRac(id: string, checked: boolean) {
    const set = new Set<string>(this.form.racIds);
    if (checked) set.add(id);
    else set.delete(id);
    this.form.racIds = [...set];
  }
  racNames(employeeId: string) {
    return this.s
      .employeeRacIds(employeeId)
      .map((id) => this.s.listName("racs", id))
      .filter(Boolean)
      .sort()
      .join(", ");
  }
  /** Última ficha assinada (eletrônica ou presencial) do colaborador. */
  lastSigned(employeeId: string) {
    return this.s
      .data()
      .sheets.filter(
        (sheet) =>
          sheet.employee_id === employeeId &&
          this.s.state(sheet.id)?.signature_status?.startsWith("SIGNED"),
      )
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0];
  }
  get employees() {
    return this.s
      .data()
      .employees.filter(
        (e) =>
          `${e.name} ${e.registration} ${e.department}`
            .toLowerCase()
            .includes(this.query.toLowerCase()) &&
          (!this.clientFilter || e.client_id === this.clientFilter) &&
          (!this.unitFilter || e.work_unit_id === this.unitFilter) &&
          (!this.racFilter || this.s.employeeRacIds(e.id).includes(this.racFilter)) &&
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
      clientId: e.client_id ?? "",
      workUnitId: e.work_unit_id ?? "",
      racIds: this.s.employeeRacIds(e.id),
    };
  }
  /** Última ficha assinada e entregue (estoque baixado), base da devolução demissional. */
  lastReturnable(employeeId: string) {
    return this.s
      .data()
      .sheets.filter((sheet) => {
        const state = this.s.state(sheet.id);
        return (
          sheet.employee_id === employeeId &&
          state?.signature_status?.startsWith("SIGNED") &&
          (RETURNABLE_RESERVATION_STATUS as readonly string[]).includes(state.reservation_status)
        );
      })
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0];
  }
  startTerminationReturn() {
    const sheet = this.terminated?.sheet;
    this.terminated = null;
    if (sheet)
      void this.router.navigate(["/rh/fichas", sheet.id, "devolucao"], {
        queryParams: { desligamento: 1 },
      });
  }
  async save() {
    const previous = this.editing ? this.s.employee(this.editing) : undefined;
    const newlyTerminated =
      !!this.form.terminationDate && !previous?.termination_date;
    const registration = this.form.registration?.trim();
    const ok = await this.s.action(
      () =>
        this.s.saveEmployee(
          {
            ...this.form,
            personalEmail: this.form.personalEmail || null,
            terminationDate: this.form.terminationDate || null,
            cpf: this.form.cpf || null,
            clientId: this.form.clientId || null,
            workUnitId: this.form.workUnitId || null,
            racIds: this.form.racIds,
          },
          this.editing || undefined,
        ),
      "Colaborador salvo.",
    );
    if (ok && newlyTerminated) {
      const employee =
        previous ?? this.s.data().employees.find((e) => e.registration === registration);
      if (employee)
        this.terminated = { employee, sheet: this.lastReturnable(employee.id) };
    }
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
