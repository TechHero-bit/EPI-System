import { Component, inject, OnDestroy } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusComponent],
  templateUrl: "./sheets.page.html",
})
export class SheetsComponent implements OnDestroy {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  query = "";
  status = "";
  employee: string | null = null;
  private querySubscription = this.route.queryParamMap.subscribe((params) => {
    const status = params.get("status") ?? "";
    this.status = ["PENDING", "SIGNED_MANUAL", "SIGNED_ELECTRONIC"].includes(
      status,
    )
      ? status
      : "";
    this.employee = params.get("employee");
  });
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
            this.s.state(f.id)?.signature_status === this.status),
      );
  }
  ngOnDestroy() {
    clearInterval(this.timer);
    this.querySubscription.unsubscribe();
  }
}
