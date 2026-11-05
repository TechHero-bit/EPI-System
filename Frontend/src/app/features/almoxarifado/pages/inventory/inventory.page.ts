import { Component, computed, inject } from "@angular/core";
import {
  SIZE_GROUPS,
  sizeGroupsFor,
  isEquipmentSize,
} from "../../../../../../../contracts/equipment-sizes.mjs";
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
  size = "";
  sizeGroups = SIZE_GROUPS;
  get filterSizeGroups() {
    const products = new Set(
      this.s
        .data()
        .products.filter((p) => !this.category || p.category === this.category)
        .map((p) => p.id),
    );
    return sizeGroupsFor(
      this.s
        .data()
        .variants.filter((v) => products.has(v.product_id))
        .map((v) => v.size),
    );
  }
  categoryChanged(category: string) {
    this.category = category;
    if (!this.filterSizeGroups.some((g) => g.sizes.includes(this.size)))
      this.size = "";
  }
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
  initialSize = "Único";
  initialVariantPending = true;
  private initialSkuKey = `EPI-${crypto.randomUUID()}`;
  movement = { variantId: "", quantity: 1, reason: "", adjust: false };
  private key = crypto.randomUUID();
  get products() {
    return this.s
      .data()
      .products.filter(
        (p) =>
          (!this.category || p.category === this.category) &&
          (!this.size ||
            this.s
              .data()
              .variants.some(
                (v) => v.product_id === p.id && v.size === this.size,
              )) &&
          `${p.description} ${p.ca ?? ""} ${p.brand} ${this.s
            .data()
            .variants.filter((v) => v.product_id === p.id)
            .map((v) => `${v.size} ${v.sku}`)
            .join(" ")}`
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
  readonly variantOptions = computed(() =>
    alphabetical(
      this.s.data().variants,
      (v) => `${this.s.product(v.product_id)?.description} · ${v.size}`,
    ),
  );
  readonly variantsByProduct = computed(() => {
    const grouped = new Map<string, any[]>();
    for (const variant of this.variantOptions()) {
      const variants = grouped.get(variant.product_id) ?? [];
      variants.push(variant);
      grouped.set(variant.product_id, variants);
    }
    return grouped;
  });
  productStock(productId: string) {
    const variants = new Set(
      this.s
        .data()
        .variants.filter((v) => v.product_id === productId)
        .map((v) => v.id),
    );
    return this.s
      .data()
      .inventory.reduce(
        (quantity, balance) =>
          quantity + (variants.has(balance.id) ? balance.stock_quantity : 0),
        0,
      );
  }
  get movements() {
    return this.s
      .data()
      .movements.filter(
        (m) =>
          (!this.kind || m.type === this.kind) &&
          `${m.reason} ${this.variantName(m.variant_id)} ${this.movementEmployee(m)?.name ?? ""} ${this.movementEmployee(m)?.registration ?? ""}`
            .toLowerCase()
            .includes(this.query.toLowerCase()),
      );
  }
  movementEmployee(movement: any) {
    const employeeId =
      movement.employee_id ??
      this.s.data().sheets.find((sheet) => sheet.id === movement.sheet_id)
        ?.employee_id;
    return this.s.employee(employeeId);
  }
  movementEmployeeLabel(movement: any) {
    return (
      this.movementEmployee(movement)?.name ??
      (movement.sheet_id || movement.type === "ISSUE"
        ? "Colaborador não identificado"
        : "Sem colaborador vinculado")
    );
  }
  variantName(id: string) {
    const v = this.s.variant(id);
    return `${this.s.product(v?.product_id)?.description ?? ""} · ${v?.size ?? ""}`;
  }
  async save() {
    await this.s.action(async () => {
      if (this.initialVariantPending && !isEquipmentSize(this.initialSize))
        throw new Error("Selecione um tamanho válido da lista.");
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
      // Keep the saved product when a size fails, so a retry cannot create it twice.
      this.editing = value.id;
      this.categoryChoice = value.category;
      this.newCategory = "";
      if (this.initialVariantPending) {
        await this.s.addVariant({
          productId: value.id,
          size: this.initialSize.trim(),
          sku: this.initialSkuKey,
          minimumStock: 0,
        });
        this.initialVariantPending = false;
      }
    }, "Equipamento salvo.");
  }
  edit(p: any) {
    this.editing = p.id;
    this.initialVariantPending = false;
    this.categoryChoice = p.category;
    this.newCategory = "";
    this.product = {
      ...p,
      caExpiresAt: p.ca_expires_at,
      riskCode: p.risk_code,
    };
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
