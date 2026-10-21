import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { DatePipe } from "@angular/common";
import {
  alphabetical,
  compareLabels,
} from "../../../../shared/utils/alphabetical";
import { PortalStore } from "../../../../core/services/portal.service";
import { today, type DraftItem } from "../../../../core/models/portal.model";
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: "./builder.page.html",
})
export class BuilderComponent {
  s = inject(PortalStore);
  router = inject(Router);
  employeeId = "";
  employeeQuery = "";
  query = "";
  category = "";
  step = 1;
  date = today();
  method = "MANUAL";
  draft: DraftItem[] = [];
  key = crypto.randomUUID();
  get employees() {
    return this.s
      .data()
      .employees.filter(
        (e) =>
          !e.termination_date &&
          `${e.name} ${e.registration}`
            .toLowerCase()
            .includes(this.employeeQuery.toLowerCase()),
      )
      .sort((a, b) => compareLabels(a.name, b.name));
  }
  get categories() {
    return [...new Set(this.s.data().products.map((p) => p.category))].sort(
      compareLabels,
    );
  }
  get variants() {
    return alphabetical(
      this.s.data().variants.filter((v) => {
        const p = this.s.product(v.product_id);
        return (
          p?.active &&
          (!this.category || p.category === this.category) &&
          `${p.description} ${p.ca} ${v.size}`
            .toLowerCase()
            .includes(this.query.toLowerCase())
        );
      }),
      (v) => `${this.s.product(v.product_id)?.description} · ${v.size}`,
    );
  }
  available(id: string) {
    const p = this.s.product(this.s.variant(id)?.product_id);
    if (p?.ca_expires_at && p.ca_expires_at < today()) return 0;
    return (
      this.s.stock(id) -
      this.draft.filter((item) => item.variantId === id).length
    );
  }
  add(v: any) {
    if (this.draft.length >= 15) {
      this.s.failure.set("Limite de 15 itens por ficha.");
      return;
    }
    if (this.available(v.id) < 1) return;
    this.draft.push({
      variantId: v.id,
      quantity: 1,
      risk: this.s.product(v.product_id)?.risk_code ?? "",
      description: this.s.product(v.product_id)?.description,
      ca: this.s.product(v.product_id)?.ca ?? "",
      brand: this.s.product(v.product_id)?.brand,
    });
  }
  async issue() {
    await this.s.action(async () => {
      const value = await this.s.issue(
        this.employeeId,
        this.draft.map((item) => ({
          ...item,
          deliveryDate: item.deliveryDate || this.date,
        })),
        this.method,
        this.date,
        this.key,
      );
      await this.router.navigate(["/rh/fichas", value.id]);
    }, "Ficha gerada. Os itens foram reservados.");
  }
}
