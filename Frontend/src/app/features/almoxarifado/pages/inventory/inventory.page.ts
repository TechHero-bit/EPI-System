import { Component, inject } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { categories, today } from "../../../../core/models/portal.model";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
import {
  alphabetical,
  compareLabels,
} from "../../../../shared/utils/alphabetical";
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, StatusComponent],
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
  lot: any = {
    variantId: "",
    batchCode: "",
    supplier: "",
    receivedAt: today(),
    expiresAt: null,
    unitCost: 0,
    condition: "NOVO",
    location: "",
  };
  movement = { lotId: "", quantity: 1, reason: "", adjust: false };
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
  get lotOptions() {
    return alphabetical(this.s.data().lots, (l) => this.lotName(l.id));
  }
  get lots() {
    return this.s.data().lots.filter((l) => {
      const v = this.s.variant(l.variant_id);
      const p = this.s.product(v?.product_id);
      return (
        (!this.onlyLow || this.s.stock(v.id) <= v.minimum_stock) &&
        (!this.category || p?.category === this.category) &&
        `${p?.description} ${v?.size} ${v?.sku} ${l.batch_code}`
          .toLowerCase()
          .includes(this.query.toLowerCase())
      );
    });
  }
  get movements() {
    return this.s
      .data()
      .movements.filter(
        (m) =>
          (!this.kind || m.type === this.kind) &&
          `${m.reason} ${this.lotName(m.lot_id)}`
            .toLowerCase()
            .includes(this.query.toLowerCase()),
      );
  }
  lotName(id: string) {
    const l = this.s.data().lots.find((l) => l.id === id);
    const v = this.s.variant(l?.variant_id);
    return `${this.s.product(v?.product_id)?.description ?? ""} · ${v?.size ?? ""} · ${l?.batch_code ?? ""}`;
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
    }, "Equipamento salvo. Cadastre as variações e lotes na tela de estoque.");
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
  async addLot() {
    await this.s.action(async () => {
      await this.s.addLot(this.lot);
      this.lot = {
        variantId: "",
        batchCode: "",
        supplier: "",
        receivedAt: today(),
        expiresAt: null,
        unitCost: 0,
        condition: "NOVO",
        location: "",
      };
    }, "Lote cadastrado. Registre uma entrada para disponibilizar o saldo.");
  }
  async move() {
    const ok = await this.s.action(async () => {
      await this.s.movement(
        this.movement.lotId,
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
