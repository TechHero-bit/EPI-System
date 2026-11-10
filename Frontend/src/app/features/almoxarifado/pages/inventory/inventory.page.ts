import { Component, computed, inject } from "@angular/core";
import {
  SIZE_GROUPS,
  sizeGroupsFor,
} from "../../../../../../../contracts/equipment-sizes.mjs";
import {
  CA_SEVERITIES,
  caAlertLevel,
  caSeverity,
  caSeverityLabel,
  daysUntil,
} from "../../../../../../../contracts/ca-alerts.mjs";
import { DatePipe, NgTemplateOutlet } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { categories, today } from "../../../../core/models/portal.model";
import type { MovementOperation } from "../../../../core/services/demo-repository.service";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
import {
  alphabetical,
  compareLabels,
} from "../../../../shared/utils/alphabetical";

const emptyProduct = () => ({
  description: "",
  category: "",
  ca: "",
  brand: "",
  model: "",
  riskCode: "",
  caExpiresAt: null as string | null,
  unit: "UN",
});
const caDigits = (value: unknown) => {
  const digits = String(value ?? "")
    .trim()
    .replace(/^C\.?A\.?\s*/i, "");
  return /^\d{1,10}$/.test(digits) ? String(Number(digits)) : "";
};

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, StatusComponent, NgTemplateOutlet],
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
  kind = "";
  /** Filtro de validade do C.A.: CRITICAL, WARNING, NORMAL, OK (sem alerta) ou todos. */
  validity = "";
  readonly severities = CA_SEVERITIES;
  sizeGroups = SIZE_GROUPS;
  categories = categories;
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
    // "Todas as categorias" limpa o tamanho dependente para devolver todos os itens.
    if (!category || !this.filterSizeGroups.some((g) => g.sizes.includes(this.size)))
      this.size = "";
  }

  // Cadastro / edição do equipamento e da grade de tamanhos.
  editing = "";
  categoryChoice = "";
  newCategory = "";
  product: any = emptyProduct();
  grid: string = SIZE_GROUPS[0].label;
  selectedSizes = new Set<string>(["Único"]);
  rangeFrom = "";
  rangeTo = "";
  caInfo: any = null;
  caMessage = "";
  /** Cadastro aberto a partir da busca por C.A. na movimentação. */
  inlineCreate = false;

  get gridSizes(): readonly string[] {
    return SIZE_GROUPS.find((g) => g.label === this.grid)?.sizes ?? [];
  }
  /** Trocar a grade mantém só os tamanhos dela; "Tamanho único" marca Único. */
  gridChanged(label: string) {
    this.grid = label;
    const sizes: readonly string[] = SIZE_GROUPS.find((g) => g.label === label)?.sizes ?? [];
    const kept = [...this.selectedSizes].filter((size) => sizes.includes(size));
    this.selectedSizes = new Set(kept.length || sizes.length > 1 ? kept : sizes);
  }
  toggleSize(size: string, checked: boolean) {
    if (checked) this.selectedSizes.add(size);
    else this.selectedSizes.delete(size);
    this.selectedSizes = new Set(this.selectedSizes);
  }
  markRange() {
    const from = Number(this.rangeFrom),
      to = Number(this.rangeTo);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 70 || from > to) {
      this.s.failure.set("Informe um intervalo numérico entre 1 e 70.");
      return;
    }
    for (let n = from; n <= to; n++) this.selectedSizes.add(String(n));
    this.selectedSizes = new Set(this.selectedSizes);
  }
  get orderedSelection() {
    return SIZE_GROUPS.flatMap((g) => g.sizes.filter((size) => this.selectedSizes.has(size)));
  }
  /** Tamanho existente do equipamento em edição (ativo ou não). */
  editingVariant(size: string) {
    return this.s
      .data()
      .variants.find((v) => v.product_id === this.editing && v.size === size);
  }
  get allCategories() {
    return [
      ...new Set([
        ...categories,
        ...this.s.data().products.map((p) => p.category),
      ]),
    ].sort(compareLabels);
  }
  startNew() {
    this.editing = "";
    this.product = emptyProduct();
    this.categoryChoice = "";
    this.newCategory = "";
    this.grid = SIZE_GROUPS[0].label;
    this.selectedSizes = new Set(["Único"]);
    this.caInfo = null;
    this.caMessage = "";
  }
  edit(p: any) {
    this.inlineCreate = false;
    this.editing = p.id;
    this.categoryChoice = p.category;
    this.newCategory = "";
    this.caInfo = null;
    this.caMessage = "";
    this.product = {
      ...p,
      caExpiresAt: p.ca_expires_at,
      riskCode: p.risk_code,
    };
    const active = this.s
      .data()
      .variants.filter((v) => v.product_id === p.id && v.active !== false)
      .map((v) => v.size);
    this.selectedSizes = new Set(active);
    this.grid =
      SIZE_GROUPS.find((g) => g.sizes.some((size) => active.includes(size)))
        ?.label ?? SIZE_GROUPS[0].label;
  }
  /** Preenche validade e dados do equipamento a partir da base de C.A.; nunca bloqueia o cadastro. */
  async lookupCa() {
    const ca = caDigits(this.product.ca);
    this.caInfo = null;
    if (!ca) {
      this.caMessage = "Informe somente os números do C.A. para consultar.";
      return;
    }
    try {
      const found = await this.s.caLookup(ca);
      this.caInfo = found;
      if (found.expires_at) this.product.caExpiresAt = found.expires_at;
      if (!this.product.description?.trim())
        this.product.description = (found.equipment_name || "").slice(0, 180);
      if (!this.product.brand?.trim())
        this.product.brand = (found.brand || found.manufacturer || "").slice(0, 100);
      this.caMessage = `C.A. ${found.ca_number} encontrado${found.status ? ` (${found.status})` : ""}. Confira e ajuste os campos se necessário.`;
    } catch (e) {
      this.caMessage =
        (e instanceof Error ? e.message : "Consulta indisponível.") +
        " O cadastro manual continua disponível.";
    }
  }
  async save() {
    let message = "Equipamento salvo.";
    const ok = await this.s.action(async () => {
      if (!this.selectedSizes.size)
        throw new Error("Marque ao menos um tamanho do equipamento.");
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
      // Keep the saved product when sizes fail, so a retry cannot create it twice.
      this.editing = value.id;
      this.categoryChoice = value.category;
      this.newCategory = "";
      const changes = await this.s.syncSizes(value.id, this.orderedSelection);
      const deactivated = changes.filter((c) => c.result === "DEACTIVATED");
      if (this.inlineCreate) {
        this.inlineCreate = false;
        this.selectProduct(value.id);
        this.editing = "";
      }
      if (deactivated.length)
        message = `Equipamento salvo. Tamanhos com saldo ou histórico foram desativados: ${deactivated.map((c) => c.size).join(", ")}.`;
    }, "");
    if (ok) this.s.message.set(message);
  }

  // Catálogo.
  get products() {
    return this.s
      .data()
      .products.filter(
        (p) =>
          (!this.category || p.category === this.category) &&
          (!this.validity || (this.severityOf(p) ?? "OK") === this.validity) &&
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
      .sort(
        (a, b) =>
          this.alertRank(a) - this.alertRank(b) ||
          compareLabels(a.description, b.description),
      );
  }
  readonly variantOptions = computed(() =>
    alphabetical(
      this.s.data().variants,
      (v) => `${this.s.product(v.product_id)?.description} · ${v.size}`,
    ),
  );
  readonly variantsByProduct = computed(() => {
    const grouped = new Map<string, any[]>();
    const order = SIZE_GROUPS.flatMap((g) => [...g.sizes]);
    for (const variant of this.variantOptions()) {
      const variants = grouped.get(variant.product_id) ?? [];
      variants.push(variant);
      grouped.set(variant.product_id, variants);
    }
    for (const list of grouped.values())
      list.sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
    return grouped;
  });
  productStock(productId: string) {
    return (this.variantsByProduct().get(productId) ?? []).reduce(
      (quantity, v) => quantity + this.s.stock(v.id),
      0,
    );
  }
  caAlert(p: any) {
    return caAlertLevel(p?.ca_expires_at, today());
  }
  severityOf(p: any) {
    return caSeverity(this.caAlert(p));
  }
  /** Texto curto: faixa + prazo. A data aparece completa só quando já venceu. */
  caAlertText(p: any) {
    const severity = this.severityOf(p);
    if (!severity) return "";
    const days = daysUntil(p.ca_expires_at, today());
    const when =
      days < 0
        ? `vencido em ${p.ca_expires_at.slice(0, 10).split("-").reverse().join("/")}`
        : days === 0
          ? "vence hoje"
          : `vence em ${days} ${days === 1 ? "dia" : "dias"}`;
    return `${caSeverityLabel(severity)} · ${when}`;
  }
  severityCount(id: string) {
    return this.caAlerts.filter((p) => this.severityOf(p) === id).length;
  }
  toggleValidity(id: string) {
    this.validity = this.validity === id ? "" : id;
  }
  private alertRank(p: any) {
    return ["EXPIRED", "D7", "D15", "D30"].indexOf(this.caAlert(p) ?? "") >>> 0;
  }
  get caAlerts() {
    return this.s.data().products.filter((p) => p.active && this.caAlert(p));
  }

  // Movimentação.
  movement = {
    productId: "",
    variantId: "",
    operation: "RECEIPT" as MovementOperation,
    quantity: 1,
    reason: "",
  };
  caQuery = "";
  caSearchMessage = "";
  caNotFound = "";
  private key = crypto.randomUUID();
  get movementProducts() {
    return alphabetical(
      this.s.data().products.filter((p) => p.active),
      (p) => p.description,
    );
  }
  get movementSizes() {
    return (this.variantsByProduct().get(this.movement.productId) ?? []).filter(
      (v) => v.active !== false || this.movement.operation !== "RECEIPT",
    );
  }
  selectProduct(id: string) {
    this.movement.productId = id;
    const sizes = this.movementSizes;
    this.movement.variantId = sizes.length === 1 ? sizes[0].id : "";
  }
  findByCa() {
    this.caNotFound = "";
    this.caSearchMessage = "";
    const ca = caDigits(this.caQuery);
    if (!ca) {
      this.caSearchMessage = "Informe somente os números do C.A.";
      return;
    }
    const found = this.s.data().products.find((p) => p.active && caDigits(p.ca) === ca);
    if (found) {
      this.selectProduct(found.id);
      this.caSearchMessage = `Equipamento encontrado: ${found.description}. Escolha o tamanho e a quantidade.`;
    } else this.caNotFound = ca;
  }
  async createFromCa() {
    this.startNew();
    this.inlineCreate = true;
    this.product.ca = this.caNotFound;
    this.caNotFound = "";
    await this.lookupCa();
  }
  cancelInline() {
    this.inlineCreate = false;
    this.startNew();
  }
  get operationHint() {
    return {
      RECEIPT: "Quantidade recebida",
      WITHDRAWAL: "Quantidade retirada",
      ADJUSTMENT: "Variação do saldo (negativo para reduzir)",
    }[this.movement.operation];
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
  async move() {
    const ok = await this.s.action(async () => {
      if (!this.movement.variantId)
        throw new Error("Escolha o equipamento e o tamanho.");
      await this.s.movement(
        this.movement.variantId,
        this.movement.operation,
        Number(this.movement.quantity),
        this.movement.reason,
        this.key,
      );
    }, "Movimentação registrada.");
    if (ok) {
      this.key = crypto.randomUUID();
      this.movement.reason = "";
      this.movement.quantity = 1;
    }
  }
}
