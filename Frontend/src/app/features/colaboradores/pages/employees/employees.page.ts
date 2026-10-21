import { Component, inject } from "@angular/core";
import { alphabetical } from "../../../../shared/utils/alphabetical";
import { FormsModule } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
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
