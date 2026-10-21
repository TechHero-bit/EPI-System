import { Component, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { categories } from "../../../../core/models/portal.model";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
import {
  alphabetical,
  compareLabels,
} from "../../../../shared/utils/alphabetical";
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, StatusComponent],
  templateUrl: "./inventory.page.html",
})
export class InventoryComponent {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  get page() {
    return this.route.snapshot.data["page"];
  }
  query = "";
  category = "";
  onlyLow = false;
  kind = "";
  categories = categories;
  editing = "";
  categoryChoice = "";
  newCategory = "";
  product: any = {
    description: "",
    category: "",
    ca: "",
    brand: "",
    model: "",
    riskCode: "",
    caExpiresAt: null,
    unit: "UN",
  };
  variant = { productId: "", size: "Único", sku: "", minimumStock: 5 };
  movement = { variantId: "", quantity: 1, reason: "", adjust: false };
  private key = crypto.randomUUID();
  get products() {
    return this.s
      .data()
      .products.filter(
        (p) =>
          (!this.category || p.category === this.category) &&
          `${p.description} ${p.ca ?? ""} ${p.brand}`
            .toLowerCase()
            .includes(this.query.toLowerCase()),
      )
      .sort((a, b) => compareLabels(a.description, b.description));
  }
  get allCategories() {
    return [
      ...new Set([
        ...categories,
        ...this.s.data().products.map((p) => p.category),
      ]),
    ].sort(compareLabels);
  }
  get productOptions() {
    return alphabetical(this.s.data().products, (p) => p.description);
  }
  get variantOptions() {
    return alphabetical(
      this.s.data().variants,
      (v) => `${this.s.product(v.product_id)?.description} · ${v.size}`,
    );
  }
  get stockRows() {
    return alphabetical(
      this.s.data().inventory.filter((l) => {
        const v = this.s.variant(l.id);
        const p = this.s.product(v?.product_id);
        return (
          (!this.onlyLow || this.s.stock(v.id) <= v.minimum_stock) &&
          (!this.category || p?.category === this.category) &&
          `${p?.description} ${v?.size} ${v?.sku}`
            .toLowerCase()
            .includes(this.query.toLowerCase())
        );
      }),
      (row) => this.variantName(row.id),
    );
  }
  get movements() {
    return this.s
      .data()
      .movements.filter(
        (m) =>
          (!this.kind || m.type === this.kind) &&
          `${m.reason} ${this.variantName(m.variant_id)}`
            .toLowerCase()
            .includes(this.query.toLowerCase()),
      );
  }
  variantName(id: string) {
    const v = this.s.variant(id);
    return `${this.s.product(v?.product_id)?.description ?? ""} · ${v?.size ?? ""}`;
  }
  async save() {
    await this.s.action(async () => {
      const value = await this.s.saveProduct(
        {
          ...this.product,
          category:
            this.categoryChoice === "__new__"
              ? this.newCategory.trim()
              : this.categoryChoice,
          ca: this.product.ca || null,
          caExpiresAt: this.product.caExpiresAt || null,
        },
        this.editing || undefined,
      );
      this.variant.productId = value.id;
      this.categoryChoice = value.category;
      this.newCategory = "";
    }, "Equipamento salvo. Cadastre os tamanhos e registre o saldo na tela de estoque.");
  }
  edit(p: any) {
    this.editing = p.id;
    this.categoryChoice = p.category;
    this.newCategory = "";
    this.product = {
      ...p,
      caExpiresAt: p.ca_expires_at,
      riskCode: p.risk_code,
    };
  }
  async addVariant() {
    await this.s.action(async () => {
      await this.s.addVariant(this.variant);
      this.variant = { productId: "", size: "Único", sku: "", minimumStock: 5 };
    }, "Variação cadastrada.");
  }
  async move() {
    const ok = await this.s.action(async () => {
      await this.s.movement(
        this.movement.variantId,
        Number(this.movement.quantity),
        this.movement.reason,
        this.movement.adjust,
        this.key,
      );
    }, "Movimentação registrada.");
    if (ok) {
      this.key = crypto.randomUUID();
      this.movement.reason = "";
    }
  }
}
