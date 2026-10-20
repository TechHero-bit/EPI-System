import { Component, inject } from "@angular/core";
import { DatePipe, DecimalPipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../core/portal.store";
import { categories, today } from "../../core/models";
import { StatusComponent } from "../../components/status.component";
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, StatusComponent],
  templateUrl: "./inventory.component.html",
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
  product: any = {
    description: "",
    category: categories[0],
    ca: "",
    brand: "",
    model: "",
    riskCode: "",
    caExpiresAt: null,
    photoUrl: "",
    unit: "UN",
    usefulLifeDays: null,
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
      );
  }
  get allCategories() {
    return [
      ...new Set([
        ...categories,
        ...this.s.data().products.map((p) => p.category),
      ]),
    ];
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
          ca: this.product.ca || null,
          caExpiresAt: this.product.caExpiresAt || null,
        },
        this.editing || undefined,
      );
      this.variant.productId = value.id;
    }, "Equipamento salvo. Cadastre as variações e lotes na tela de estoque.");
  }
  edit(p: any) {
    this.editing = p.id;
    this.product = {
      ...p,
      caExpiresAt: p.ca_expires_at,
      riskCode: p.risk_code,
      photoUrl: p.photo_url ?? "",
      usefulLifeDays: p.useful_life_days,
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
