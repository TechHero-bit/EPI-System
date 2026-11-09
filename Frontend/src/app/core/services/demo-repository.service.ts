import {
  SIGNATURE_TERMS,
  SIGNATURE_TERMS_VERSION,
  SIGNATURE_STYLES,
  normalizeSignerName,
} from "../../../../../contracts/signature.mjs";
import { DEMO_CA_REGISTRY } from "./demo-ca";
import { isEquipmentSize } from "../../../../../contracts/equipment-sizes.mjs";
import {
  isReturnReason,
  RETURNABLE_RESERVATION_STATUS,
} from "../../../../../contracts/returns.mjs";
import {
  categories,
  emptyData,
  HR,
  LIST_KINDS,
  normalizeJobTitle,
  type ListKind,
  STOCK,
  today,
  type DraftItem,
  type PortalData,
  type Role,
} from "../models/portal.model";

// Apenas dados sintéticos. Este módulo não faz chamadas de rede.
export const TEST_CPF = "93492854010";
/** Dados do colaborador congelados na ficha. Nunca inclui CPF nem contatos. */
const snapshotEmployee = (e: any) => ({
  name: e.name,
  registration: e.registration,
  job_title: e.job_title,
  department: e.department,
  admission_date: e.admission_date,
  termination_date: e.termination_date ?? null,
});
const shiftDays = (days: number) => {
  const base = new Date(`${today()}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};
// Validades fictícias relativas a hoje, para exibir cada nível de alerta do C.A.
const demoCaExpiry = [null, null, null, null, -3, 5, 12, 25];
export const MOVEMENT_OPERATIONS = ["RECEIPT", "WITHDRAWAL", "ADJUSTMENT"] as const;
export type MovementOperation = (typeof MOVEMENT_OPERATIONS)[number];
export function makeDemoData(): PortalData {
  const data = emptyData();
  data.organization = { id: "demo", name: "Horizonte • Empresa fictícia" };
  const names = [
    "Ana Martins",
    "Bruno Almeida",
    "Carla Nunes",
    "Daniel Rocha",
    "Elisa Costa",
    "Felipe Lima",
    "Gabriela Dias",
    "Henrique Souza",
    "Isabela Melo",
    "João Ribeiro",
  ];
  data.employees = names.map((name, i) => ({
    id: `employee-${i}`,
    name,
    registration: `DEMO-${String(i + 1).padStart(3, "0")}`,
    department: ["Operações", "Manutenção", "Logística"][i % 3],
    job_title: ["Operador(a)", "Técnico(a)", "Auxiliar"][i % 3],
    admission_date: "2025-02-10",
    termination_date: null,
    personal_email: `pessoa${i + 1}@example.invalid`,
    email_verified_at: null,
    phone: "",
    work_unit: "Unidade demonstrativa",
    facial_opt_in: false,
    // CPF de teste fictício, igual para todos os colaboradores da demonstração.
    cpf: TEST_CPF,
  }));
  // Listas e kits fictícios; em produção vêm das telas de Administração e RH.
  data.clients = ["Cliente Fictício Alfa", "Cliente Fictício Beta"].map((name, i) => ({
    id: `client-${i}`,
    name,
    active: true,
  }));
  data.workUnits = ["Unidade demonstrativa", "Unidade fictícia Sul"].map((name, i) => ({
    id: `unit-${i}`,
    name,
    active: true,
  }));
  data.racs = ["RAC 01 - Trabalho em altura", "RAC 02 - Espaço confinado", "RAC 03 - Eletricidade"].map(
    (name, i) => ({ id: `rac-${i}`, name, active: true }),
  );
  data.employees.forEach((e, i) => {
    e.client_id = data.clients![i % 2].id;
    e.work_unit_id = "unit-0";
  });
  data.employeeRacs = [
    { employee_id: "employee-0", rac_id: "rac-0" },
    { employee_id: "employee-1", rac_id: "rac-1" },
    { employee_id: "employee-2", rac_id: "rac-0" },
    { employee_id: "employee-2", rac_id: "rac-2" },
  ];
  data.kits = [{ id: "kit-0", client_id: "client-0", job_title: "Operador(a)" }];
  data.kitItems = [
    { kit_id: "kit-0", product_id: "product-0", quantity: 1 },
    { kit_id: "kit-0", product_id: "product-2", quantity: 2 },
    { kit_id: "kit-0", product_id: "product-4", quantity: 1 },
  ];
  data.returns = [];
  const equipment = [
    "Bota de segurança em couro",
    "Capacete com suspensão",
    "Luva de proteção mecânica",
    "Cinto paraquedista",
    "Bota impermeável",
    "Capacete com jugular",
    "Luva nitrílica",
    "Cinto com talabarte",
  ];
  data.products = equipment.map((description, i) => ({
    id: `product-${i}`,
    description,
    category: categories[i % 4],
    ca: `DEMO-${1100 + i}`,
    brand: "Proteção Demo",
    model: `Série ${i + 1}`,
    risk_code: "",
    ca_expires_at:
      demoCaExpiry[i] === null ? "2028-12-31" : shiftDays(demoCaExpiry[i]!),
    active: true,
    photo_url: null,
    unit: "UN",
    useful_life_days: 180,
  }));
  data.variants = equipment.map((_, i) => ({
    id: `variant-${i}`,
    product_id: `product-${i}`,
    size: ["40", "Único", "M", "G", "42", "Único", "G", "M"][i],
    sku: `DEMO-EPI-${i + 1}`,
    minimum_stock: 5,
    active: true,
  }));
  data.inventory = data.variants.map((v, i) => ({
    id: v.id,
    stock_quantity: [24, 3, 15, 8, 0, 18, 4, 12][i],
    reserved_quantity: 0,
    blocked_quantity: 0,
  }));
  data.movements = data.inventory.map((l, i) => ({
    id: `movement-${i}`,
    variant_id: l.id,
    type: "RECEIPT",
    quantity: l.stock_quantity,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    reason: "Entrada fictícia para demonstração",
  }));
  const signatures = [
    "PENDING",
    "SIGNED_MANUAL",
    "SIGNED_ELECTRONIC",
    "PENDING",
  ];
  for (let i = 0; i < 4; i++) {
    const snapshot = {
      recordNumber: data.employees[i].registration,
      template: "COMPANY_EPI_2026_V4",
      issuedAt: new Date(Date.now() - i * 86400000).toISOString(),
      organizationName: data.organization.name,
      employee: snapshotEmployee(data.employees[i]),
      items: [
        {
          description: equipment[i],
          ca: data.products[i].ca,
          date: today(),
          brand: data.products[i].brand,
          risk: data.products[i].risk_code,
          size: data.variants[i].size,
          quantity: 1,
        },
      ],
      documentDate: today(),
      method: i % 2 ? "MANUAL" : "ELECTRONIC",
    };
    data.sheets.push({
      id: `sheet-${i}`,
      employee_id: `employee-${i}`,
      version: 1,
      employee_registration: data.employees[i].registration,
      issued_at: new Date(Date.now() - i * 86400000).toISOString(),
      signature_method: snapshot.method,
      snapshot,
      items: [{ variantId: `variant-${i}`, quantity: 1, risk: "" }],
      pdf_sha256: "Documento fictício — sem validade jurídica",
    });
    if (i !== 2) data.inventory[i].reserved_quantity++;
    data.states.push({
      sheet_id: `sheet-${i}`,
      signature_status: signatures[i],
      receipt_status: i === 2 ? "CONFIRMED" : "UNCONFIRMED",
      reservation_status: i === 2 ? "DELIVERED" : "RESERVED",
    });
  }
  data.audits = [
    {
      id: 1,
      action: "DEMO_INITIALIZED",
      entity: "demo",
      created_at: new Date().toISOString(),
      detail: { synthetic: true },
    },
  ];
  return data;
}

export class DemoRepository {
  constructor(public data: PortalData = makeDemoData()) {
    // Browser data saved before the managed lists existed.
    for (const key of ["clients", "workUnits", "racs", "employeeRacs", "kits", "kitItems", "returns"] as const)
      (data as any)[key] ??= [];
    // One-time migration of browser v2 data. Original storage is separately backed up.
    const legacy = (data as any).lots as any[] | undefined;
    if (!data.inventory) {
      data.inventory = data.variants.map((v) => {
        const rows = (legacy ?? []).filter((l) => l.variant_id === v.id);
        return {
          id: v.id,
          stock_quantity: rows.reduce((n, l) => n + l.stock_quantity, 0),
          reserved_quantity: rows.reduce(
            (n, l) => n + (l.reserved_quantity ?? 0),
            0,
          ),
          blocked_quantity: rows
            .filter(
              (l) =>
                l.condition === "AVARIADO" ||
                (l.expires_at && l.expires_at < today()),
            )
            .reduce(
              (n, l) => n + l.stock_quantity - (l.reserved_quantity ?? 0),
              0,
            ),
        };
      });
      for (const movement of data.movements)
        movement.variant_id ??= legacy?.find(
          (l) => l.id === movement.lot_id,
        )?.variant_id;
    }
  }
  private require(allowed: Role[]) {
    if (!allowed.includes(this.data.role))
      throw new Error("Seu perfil não permite esta ação.");
  }
  private event(
    action: string,
    id: string,
    detail: Record<string, unknown> = {},
  ) {
    this.data.audits.unshift({
      id: crypto.randomUUID(),
      action,
      entity_id: id,
      created_at: new Date().toISOString(),
      detail: { demo: true, ...detail },
    });
  }
  available(balance: any): number {
    return (
      balance.stock_quantity -
      (balance.reserved_quantity ?? 0) -
      (balance.blocked_quantity ?? 0)
    );
  }
  product(body: any, id?: string) {
    this.require(STOCK);
    if (!body.description?.trim() || !body.category?.trim())
      throw new Error("Informe nome e categoria.");
    const existing = this.data.products.find((p) => p.id === id);
    const value = {
      id: id ?? crypto.randomUUID(),
      ...body,
      ca_expires_at: body.caExpiresAt || null,
      risk_code: body.riskCode ?? "",
      active: body.active ?? true,
      photo_url:
        body.photoUrl === undefined
          ? (existing?.photo_url ?? null)
          : body.photoUrl || null,
      useful_life_days:
        body.usefulLifeDays === undefined
          ? (existing?.useful_life_days ?? null)
          : body.usefulLifeDays || null,
    };
    if (id)
      Object.assign(this.data.products.find((p) => p.id === id) ?? {}, value);
    else this.data.products.push(value);
    this.event("PRODUCT_SAVED", value.id);
    return value;
  }
  employee(body: any, id?: string) {
    this.require(HR);
    if (
      !body.name?.trim() ||
      !body.registration?.trim() ||
      !body.jobTitle?.trim()
    )
      throw new Error("Informe nome, matrícula e cargo.");
    if (
      this.data.employees.some(
        (e) => e.registration === body.registration.trim() && e.id !== id,
      )
    )
      throw new Error("Matrícula já cadastrada.");
    const value = {
      id: id ?? crypto.randomUUID(),
      name: body.name,
      registration: body.registration.trim(),
      department: body.department,
      job_title: body.jobTitle,
      admission_date: body.admissionDate,
      termination_date: body.terminationDate || null,
      personal_email: body.personalEmail || null,
      phone: body.phone ?? "",
      work_unit: body.workUnit ?? "",
      facial_opt_in: body.facialOptIn ?? false,
      email_verified_at: null,
      cpf: body.cpf ? String(body.cpf).replace(/\D/g, "") : null,
      client_id: body.clientId || null,
      work_unit_id: body.workUnitId || null,
    };
    if (value.cpf && !/^\d{11}$/.test(value.cpf))
      throw new Error("CPF deve ter 11 dígitos.");
    if (value.client_id && !this.data.clients!.some((c) => c.id === value.client_id))
      throw new Error("Cliente não encontrado.");
    const unit = this.data.workUnits!.find((u) => u.id === value.work_unit_id);
    if (value.work_unit_id && !unit) throw new Error("Unidade não encontrada.");
    if (unit) value.work_unit = unit.name;
    const racIds: string[] | undefined = body.racIds;
    if (racIds?.some((r) => !this.data.racs!.some((rac) => rac.id === r)))
      throw new Error("RAC inválido.");
    if (id)
      Object.assign(this.data.employees.find((e) => e.id === id) ?? {}, value);
    else this.data.employees.push(value);
    if (racIds)
      this.data.employeeRacs = [
        ...this.data.employeeRacs!.filter((r) => r.employee_id !== value.id),
        ...[...new Set(racIds)].map((rac_id) => ({ employee_id: value.id, rac_id })),
      ];
    this.event("EMPLOYEE_SAVED", value.id);
    return value;
  }
  /** Clientes, unidades e RACs: somente ADMIN, como na API. */
  listItem(kind: ListKind, body: { name?: string; active?: boolean }, id?: string) {
    this.require(["ADMIN"]);
    const meta = LIST_KINDS[kind];
    if (!meta) throw new Error("Lista não encontrada.");
    const rows = (this.data as any)[meta.key] as any[];
    const name = body.name?.trim();
    if (name !== undefined && (name.length < 1 || name.length > 160))
      throw new Error("Informe um nome de até 160 caracteres.");
    if (
      name &&
      rows.some(
        (r) => r.id !== id && r.name.trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"),
      )
    )
      throw new Error("Já existe um item com esse nome.");
    if (id) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("Item não encontrado.");
      if (name) row.name = name;
      if (body.active !== undefined) row.active = body.active;
      this.event("LIST_ITEM_UPDATED", id);
      return row;
    }
    if (!name) throw new Error("Informe o nome.");
    const row = { id: crypto.randomUUID(), name, active: true };
    rows.push(row);
    this.event("LIST_ITEM_CREATED", row.id);
    return row;
  }
  /** Kit por cliente e função (ADMIN e RH). Regravar substitui os itens. */
  saveKit(clientId: string, jobTitle: string, items: { productId: string; quantity: number }[]) {
    this.require(["ADMIN", "RH"]);
    if (!this.data.clients!.some((c) => c.id === clientId)) throw new Error("Cliente não encontrado.");
    const job = jobTitle.trim().replace(/\s+/g, " ");
    if (!job || job.length > 120) throw new Error("Informe a função.");
    if (!items.length) throw new Error("Inclua ao menos um EPI no kit.");
    if (
      items.some(
        (i) =>
          !Number.isInteger(i.quantity) ||
          i.quantity < 1 ||
          i.quantity > 15 ||
          !this.data.products.some((p) => p.id === i.productId),
      )
    )
      throw new Error("Itens do kit inválidos.");
    if (items.reduce((n, i) => n + i.quantity, 0) > 15)
      throw new Error("O kit pode ter no máximo 15 unidades, o limite da ficha.");
    let kit = this.data.kits!.find(
      (k) => k.client_id === clientId && normalizeJobTitle(k.job_title) === normalizeJobTitle(job),
    );
    if (!kit) {
      kit = { id: crypto.randomUUID(), client_id: clientId, job_title: job };
      this.data.kits!.push(kit);
    } else kit.job_title = job;
    const merged = new Map<string, number>();
    for (const i of items) merged.set(i.productId, i.quantity);
    this.data.kitItems = [
      ...this.data.kitItems!.filter((i) => i.kit_id !== kit.id),
      ...[...merged].map(([product_id, quantity]) => ({ kit_id: kit.id, product_id, quantity })),
    ];
    this.event("EPI_KIT_SAVED", kit.id);
    return kit;
  }
  deleteKit(id: string) {
    this.require(["ADMIN", "RH"]);
    this.data.kits = this.data.kits!.filter((k) => k.id !== id);
    this.data.kitItems = this.data.kitItems!.filter((i) => i.kit_id !== id);
    this.event("EPI_KIT_DELETED", id);
  }
  /** Entrada, retirada fora de ficha ou ajuste. Todas exigem justificativa. */
  movement(
    variantId: string,
    operation: MovementOperation,
    quantity: number,
    reason: string,
  ) {
    this.require(STOCK);
    const balance = this.data.inventory.find((l) => l.id === variantId);
    const variant = this.data.variants.find((v) => v.id === variantId);
    if (
      !balance ||
      !variant ||
      !MOVEMENT_OPERATIONS.includes(operation) ||
      !Number.isInteger(quantity) ||
      quantity === 0 ||
      Math.abs(quantity) > 100000 ||
      (operation !== "ADJUSTMENT" && quantity < 1)
    )
      throw new Error("Selecione equipamento, tamanho e quantidade válidos.");
    if (reason.trim().length < 5 || reason.length > 300)
      throw new Error("Informe uma justificativa de 5 a 300 caracteres.");
    if (operation === "RECEIPT" && variant.active === false)
      throw new Error("Tamanho inativo. Reative-o no cadastro do equipamento.");
    const delta = operation === "WITHDRAWAL" ? -quantity : quantity;
    if (this.available(balance) + delta < 0)
      throw new Error(
        "Saldo insuficiente. Existem unidades reservadas ou bloqueadas.",
      );
    balance.stock_quantity += delta;
    this.data.movements.unshift({
      id: crypto.randomUUID(),
      variant_id: balance.id,
      type: operation,
      quantity: delta,
      reason: reason.trim(),
      created_at: new Date().toISOString(),
    });
    this.event(
      operation === "RECEIPT"
        ? "STOCK_RECEIVED"
        : operation === "WITHDRAWAL"
          ? "STOCK_WITHDRAWN"
          : "STOCK_ADJUSTED",
      balance.id,
    );
  }
  /** Mesma regra de sync_product_sizes: tamanho com saldo ou histórico é desativado. */
  syncSizes(productId: string, sizes: string[]) {
    this.require(STOCK);
    const product = this.data.products.find((p) => p.id === productId);
    if (!product) throw new Error("Equipamento não encontrado.");
    const wanted = [...new Set(sizes)];
    if (!wanted.length) throw new Error("Marque ao menos um tamanho.");
    if (wanted.some((size) => !isEquipmentSize(size)))
      throw new Error("Selecione tamanhos da lista padronizada.");
    const changes: { size: string; result: string }[] = [];
    const variants = this.data.variants.filter((v) => v.product_id === productId);
    for (const size of wanted) {
      const existing = variants.find((v) => v.size === size);
      if (!existing) {
        const id = crypto.randomUUID();
        this.data.variants.push({
          id,
          product_id: productId,
          size,
          sku: `EPI-${id}`,
          minimum_stock: 0,
          active: true,
        });
        this.data.inventory.push({
          id,
          stock_quantity: 0,
          reserved_quantity: 0,
          blocked_quantity: 0,
        });
        changes.push({ size, result: "CREATED" });
      } else if (existing.active === false) {
        existing.active = true;
        changes.push({ size, result: "REACTIVATED" });
      }
    }
    for (const variant of variants.filter(
      (v) => v.active !== false && !wanted.includes(v.size),
    )) {
      const balance = this.data.inventory.find((b) => b.id === variant.id);
      const history =
        (balance?.stock_quantity ?? 0) > 0 ||
        (balance?.reserved_quantity ?? 0) > 0 ||
        (balance?.blocked_quantity ?? 0) > 0 ||
        this.data.movements.some((m) => m.variant_id === variant.id) ||
        this.data.sheets.some((s) =>
          (s.items ?? []).some((i: any) => i.variantId === variant.id),
        );
      if (history) {
        variant.active = false;
        changes.push({ size: variant.size, result: "DEACTIVATED" });
      } else {
        this.data.variants = this.data.variants.filter((v) => v !== variant);
        this.data.inventory = this.data.inventory.filter(
          (b) => b.id !== variant.id,
        );
        changes.push({ size: variant.size, result: "REMOVED" });
      }
    }
    this.event("PRODUCT_SIZES_SYNCED", productId, { changes });
    return changes;
  }
  /** Consulta local ao conjunto fictício; a demonstração nunca acessa a rede. */
  caLookup(value: string) {
    const digits = value.trim().replace(/^C\.?A\.?\s*/i, "");
    if (!/^\d{1,10}$/.test(digits))
      throw new Error("Informe somente os números do C.A.");
    const found = DEMO_CA_REGISTRY.find(
      (row) => row.ca_number === String(Number(digits)),
    );
    if (!found)
      throw new Error(
        "C.A. não encontrado na base fictícia. Preencha manualmente.",
      );
    return { ...found, imported_at: null, demonstration: true };
  }
  issue(
    employeeId: string,
    items: DraftItem[],
    method: string,
    date: string,
    key: string,
  ) {
    this.require(HR);
    const previous = this.data.sheets.find((s) => s.request_key === key);
    if (previous) {
      if (
        previous.employee_id !== employeeId ||
        previous.signature_method !== method ||
        previous.snapshot.documentDate !== date ||
        JSON.stringify(previous.items) !== JSON.stringify(items)
      )
        throw new Error("Chave reutilizada com conteúdo diferente.");
      return previous;
    }
    const employee = this.data.employees.find(
      (e) => e.id === employeeId && !e.termination_date,
    );
    if (!employee || !items.length || items.length > 15)
      throw new Error("Selecione colaborador ativo e entre 1 e 15 itens.");
    const demand = new Map<string, number>();
    for (const item of items) {
      if (
        Object.keys(item).some(
          (key) => !["variantId", "quantity", "deliveryDate"].includes(key),
        )
      )
        throw new Error(
          "Os dados do equipamento só podem ser alterados no Almoxarifado.",
        );
      if (item.quantity !== 1)
        throw new Error("Quantidade por item deve ser 1.");
      if (item.deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.deliveryDate))
        throw new Error("Data da entrega inválida.");
      const balance = this.data.inventory.find((l) => l.id === item.variantId);
      const variant = this.data.variants.find((v) => v.id === item.variantId);
      const product = this.data.products.find(
        (p) => p.id === variant?.product_id && p.active,
      );
      if (variant?.active === false)
        throw new Error("Tamanho inativo não pode ser incluído na ficha.");
      const count = (demand.get(item.variantId) ?? 0) + 1;
      if (
        !balance ||
        !product ||
        this.available(balance) < count ||
        (product.ca_expires_at && product.ca_expires_at < today())
      )
        throw new Error("Estoque insuficiente ou C.A. vencido.");
      demand.set(item.variantId, count);
    }
    const recordNumber = employee.registration;
    const issuedAt = new Date().toISOString();
    const sheet = {
      id: crypto.randomUUID(),
      employee_registration: recordNumber,
      employee_id: employeeId,
      version:
        this.data.sheets.filter((s) => s.employee_id === employeeId).length + 1,
      issued_at: issuedAt,
      signature_method: method,
      request_key: key,
      items: structuredClone(items),
      snapshot: {
        template: "COMPANY_EPI_2026_V4",
        recordNumber,
        issuedAt,
        organizationName: this.data.organization.name,
        employee: snapshotEmployee(employee),
        documentDate: date,
        method,
        items: items.map((i) => {
          const v = this.data.variants.find((v) => v.id === i.variantId);
          const p = this.data.products.find((p) => p.id === v.product_id);
          return {
            description: p.description,
            ca: p.ca ?? "",
            brand: p.brand,
            risk: p.risk_code ?? "",
            date: i.deliveryDate ?? date,
            size: v.size,
            quantity: 1,
          };
        }),
      },
      pdf_sha256: "DEMONSTRAÇÃO — sem assinatura válida",
    };
    for (const [id, n] of demand) {
      const balance = this.data.inventory.find((l) => l.id === id);
      balance.reserved_quantity = (balance.reserved_quantity ?? 0) + n;
    }
    this.data.sheets.unshift(sheet);
    this.data.states.unshift({
      sheet_id: sheet.id,
      signature_status: "PENDING",
      receipt_status: "UNCONFIRMED",
      reservation_status: "RESERVED",
    });
    this.event("SHEET_RESERVED", sheet.id);
    return sheet;
  }
  receipt(id: string, note: string) {
    this.require([...HR, "ALMOXARIFADO"]);
    const sheet = this.data.sheets.find((s) => s.id === id);
    const state = this.data.states.find((s) => s.sheet_id === id);
    if (!sheet || !state || state.reservation_status === "CANCELLED")
      throw new Error("Ficha indisponível.");
    if (!note.trim()) throw new Error("Informe a evidência da entrega.");
    if (note.length > 500)
      throw new Error("Limite de 500 caracteres nas observações.");
    if (state.receipt_status !== "CONFIRMED") {
      const demand = new Map<string, number>();
      for (const item of sheet.items ?? [])
        demand.set(item.variantId, (demand.get(item.variantId) ?? 0) + 1);
      for (const [variantId, count] of demand) {
        const balance = this.data.inventory.find((row) => row.id === variantId);
        if (
          !balance ||
          balance.stock_quantity < count ||
          balance.reserved_quantity < count
        )
          throw new Error("Reserva inconsistente.");
      }
    }
    if (
      sheet.signature_method === "MANUAL" &&
      state.signature_status === "PENDING"
    ) {
      this.sign(id, true);
      this.event("MANUAL_SIGNATURE_RECORDED", id, {
        note,
        documentSha256: sheet.pdf_sha256,
      });
    }
    if (state.receipt_status === "CONFIRMED") return;
    for (const item of sheet.items ?? []) {
      const balance = this.data.inventory.find((l) => l.id === item.variantId);
      balance.stock_quantity--;
      balance.reserved_quantity--;
      this.data.movements.unshift({
        id: crypto.randomUUID(),
        variant_id: balance.id,
        type: "ISSUE",
        quantity: -1,
        sheet_id: sheet.id,
        employee_id: sheet.employee_id,
        created_at: new Date().toISOString(),
        reason: note,
      });
    }
    state.receipt_status = "CONFIRMED";
    state.reservation_status = "DELIVERED";
    state.confirmed_at = new Date().toISOString();
    this.event("RECEIPT_CONFIRMED", id, { note });
  }
  cancel(id: string, note = "Cancelamento demonstrativo") {
    this.require(HR);
    if (note.trim().length < 5)
      throw new Error("Informe o motivo do cancelamento.");
    const sheet = this.data.sheets.find((s) => s.id === id);
    const state = this.data.states.find((s) => s.sheet_id === id);
    if (!sheet || !state || state.reservation_status !== "RESERVED")
      throw new Error("Apenas reservas pendentes podem ser canceladas.");
    for (const item of sheet.items ?? [])
      this.data.inventory.find((l) => l.id === item.variantId)
        .reserved_quantity--;
    state.reservation_status = "CANCELLED";
    for (const link of this.data.signingLinks ?? [])
      if (link.sheet_id === id) link.consumed = true;
    this.event("RESERVATION_CANCELLED", id, { reason: note });
  }
  /** Devolução de ficha entregue: mesmo contrato de register_sheet_return. */
  registerReturn(
    sheetId: string,
    body: {
      returnedOn: string;
      note: string;
      termination?: boolean;
      idempotencyKey: string;
      items: { index: number; reasonCode: number; destination: string }[];
    },
  ) {
    this.require(HR);
    const returns = (this.data.returns ??= []);
    const previous = returns.find((r) => r.request_key === body.idempotencyKey);
    if (previous) {
      if (previous.sheet_id !== sheetId || JSON.stringify(previous.payload) !== JSON.stringify(body))
        throw new Error("Chave reutilizada com conteúdo diferente.");
      return previous;
    }
    const sheet = this.data.sheets.find((s) => s.id === sheetId);
    const state = this.data.states.find((s) => s.sheet_id === sheetId);
    if (!sheet || !state) throw new Error("Ficha não encontrada.");
    if (!(RETURNABLE_RESERVATION_STATUS as readonly string[]).includes(state.reservation_status))
      throw new Error("Somente fichas entregues aceitam devolução.");
    const note = body.note?.trim() ?? "";
    if (!note || note.length > 500)
      throw new Error("Informe as observações da assinatura presencial da devolução (até 500 caracteres).");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.returnedOn) || body.returnedOn > today() || body.returnedOn < new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(sheet.issued_at)))
      throw new Error("Data da devolução inválida.");
    if (!body.items?.length || body.items.length > 30) throw new Error("Itens da devolução inválidos.");
    if (new Set(body.items.map((i) => i.index)).size !== body.items.length)
      throw new Error("Item repetido na devolução.");
    const returned = new Set(
      returns.filter((r) => r.sheet_id === sheetId).flatMap((r) => r.items.map((i: any) => i.item_index)),
    );
    for (const item of body.items) {
      if (!Number.isInteger(item.index) || item.index < 0 || item.index >= sheet.snapshot.items.length)
        throw new Error("Item inexistente na ficha.");
      if (!isReturnReason(item.reasonCode)) throw new Error("Motivo de devolução inválido.");
      if (!["RESTOCK", "DISCARD"].includes(item.destination)) throw new Error("Destino inválido.");
      if (returned.has(item.index)) throw new Error("Item já devolvido.");
    }
    const record = {
      id: crypto.randomUUID(),
      sheet_id: sheetId,
      employee_id: sheet.employee_id,
      returned_on: body.returnedOn,
      termination: !!body.termination,
      signature_method: "MANUAL_RECORDED",
      signature_note: note,
      request_key: body.idempotencyKey,
      payload: structuredClone(body),
      created_at: new Date().toISOString(),
      items: body.items.map((i) => ({
        item_index: i.index,
        reason_code: i.reasonCode,
        destination: i.destination,
        variant_id: sheet.items?.[i.index]?.variantId ?? null,
      })),
    };
    for (const item of record.items) {
      if (item.destination !== "RESTOCK") continue;
      const balance = this.data.inventory.find((b) => b.id === item.variant_id);
      if (!balance) throw new Error("Item histórico sem vínculo com o estoque.");
    }
    for (const item of record.items) {
      if (item.destination !== "RESTOCK") continue;
      // Only physical stock grows; reserved and blocked quantities are untouched.
      this.data.inventory.find((b) => b.id === item.variant_id).stock_quantity++;
      this.data.movements.unshift({
        id: crypto.randomUUID(),
        variant_id: item.variant_id,
        type: "RETURN",
        quantity: 1,
        sheet_id: sheetId,
        employee_id: sheet.employee_id,
        created_at: new Date().toISOString(),
        reason: `Devolução – M.D. ${item.reason_code}`,
      });
    }
    returns.push(record);
    this.event("SHEET_RETURN_RECORDED", sheetId, { returnId: record.id, termination: record.termination });
    return record;
  }
  createSigningLink(id: string) {
    this.require(HR);
    const sheet = this.data.sheets.find((s) => s.id === id);
    const state = this.data.states.find((s) => s.sheet_id === id);
    if (
      !sheet ||
      sheet.signature_method !== "ELECTRONIC" ||
      state?.signature_status !== "PENDING" ||
      state.reservation_status === "CANCELLED"
    )
      throw new Error("Ficha indisponível para assinatura por link.");
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    (this.data.signingLinks ??= []).push({
      token,
      sheet_id: id,
      expires_at: Date.now() + 24 * 60 * 60_000,
      consumed: false,
      requested: false,
      previewed: false,
    });
    this.event("SIMULATED_SIGNING_LINK_CREATED", id);
    return token;
  }
  publicSigning(
    token: string,
    step: string,
    acceptedTerms = false,
    signature?: {
      signerName?: string;
      signatureStyle?: string;
      termsVersion?: string;
      cpfStart?: string;
      cpfEnd?: string;
    },
  ) {
    const link = this.data.signingLinks?.find((link) => link.token === token);
    if (link?.blocked)
      throw new Error(
        "Link bloqueado por excesso de tentativas. Solicite um novo link ao RH.",
      );
    if (!link || link.consumed || link.expires_at <= Date.now())
      throw new Error("Link inválido, expirado ou já utilizado.");
    const sheet = this.data.sheets.find((sheet) => sheet.id === link.sheet_id);
    const state = this.data.states.find(
      (state) => state.sheet_id === link.sheet_id,
    );
    if (
      !sheet ||
      state?.reservation_status === "CANCELLED" ||
      state?.signature_status !== "PENDING"
    )
      throw new Error("Assinatura indisponível.");
    if (step === "code") link.requested = true;
    if (step === "preview") {
      if (!link.requested)
        throw new Error("Inicie a simulação antes de conferir o documento.");
      link.previewed = true;
    }
    const cpf = this.data.employees.find((e) => e.id === sheet.employee_id)?.cpf;
    if (step === "confirm") {
      if (!link.previewed || !acceptedTerms)
        throw new Error(
          "Confira o documento e aceite os termos antes de confirmar.",
        );
      // Mesma regra da API: nome + 3 primeiros + 3 últimos dígitos, 5 tentativas por link.
      if (cpf) {
        const valid =
          normalizeSignerName(signature?.signerName ?? "") ===
            normalizeSignerName(sheet.snapshot.employee.name) &&
          signature?.cpfStart === cpf.slice(0, 3) &&
          signature?.cpfEnd === cpf.slice(-3);
        if (!valid) {
          link.identityAttempts = (link.identityAttempts ?? 0) + 1;
          this.event("SIGNER_IDENTITY_FAILED", sheet.id, { attempt: link.identityAttempts });
          if (link.identityAttempts >= 5) {
            link.blocked = true;
            link.consumed = true;
            this.event("SIGNING_LINK_BLOCKED", sheet.id, { reason: "IDENTITY_ATTEMPTS" });
            throw new Error(
              "Link bloqueado por excesso de tentativas. Solicite um novo link ao RH.",
            );
          }
          throw new Error("Dados de confirmação não conferem. Revise e tente novamente.");
        }
        this.event("SIGNER_IDENTITY_CONFIRMED", sheet.id);
      }
      if (
        !signature?.signerName ||
        normalizeSignerName(signature.signerName) !==
          normalizeSignerName(sheet.snapshot.employee.name) ||
        !SIGNATURE_STYLES.some((s) => s.id === signature.signatureStyle) ||
        signature.termsVersion !== SIGNATURE_TERMS_VERSION
      )
        throw new Error(
          "Informe seu nome completo, escolha a assinatura e aceite o termo atual.",
        );
      this.sign(sheet.id);
      sheet.electronic_signature = {
        signerName: signature!.signerName!.trim(),
        signatureStyle: signature!.signatureStyle,
        termsVersion: SIGNATURE_TERMS_VERSION,
        terms: SIGNATURE_TERMS,
        acceptedTerms: true,
        signedAt: new Date().toISOString(),
        documentSha256: sheet.pdf_sha256,
      };
    }
    return {
      sheet,
      terms: SIGNATURE_TERMS,
      termsVersion: SIGNATURE_TERMS_VERSION,
      identityRequired: !!cpf,
      signerName: sheet.snapshot.employee.name,
      sha256: "DEMONSTRAÇÃO",
      pending: state.signature_status === "PENDING",
    };
  }
  sign(id: string, manual = false) {
    if (manual) this.require(HR);
    const sheet = this.data.sheets.find((s) => s.id === id);
    const state = this.data.states.find((s) => s.sheet_id === id);
    if (
      !state ||
      state.reservation_status === "CANCELLED" ||
      state.signature_status !== "PENDING"
    )
      throw new Error("Solicitação já utilizada ou cancelada.");
    if ((sheet.signature_method === "MANUAL") !== manual)
      throw new Error("Método de assinatura incompatível.");
    state.signature_status = manual ? "SIGNED_MANUAL" : "SIGNED_ELECTRONIC";
    for (const link of this.data.signingLinks ?? [])
      if (link.sheet_id === id) link.consumed = true;
    this.event("SIMULATED_SIGNATURE", id);
  }
}
