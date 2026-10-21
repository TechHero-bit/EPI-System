import {
  categories,
  emptyData,
  HR,
  STOCK,
  today,
  type DraftItem,
  type PortalData,
  type Role,
} from "../models/portal.model";

// Apenas dados sintéticos. Este módulo não faz chamadas de rede.
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
  }));
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
    ca_expires_at: "2028-12-31",
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
  }));
  data.inventory = data.variants.map((v, i) => ({
    id: v.id,
    stock_quantity: [24, 3, 15, 8, 0, 18, 4, 12][i],
    reserved_quantity: 0,
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
      template: "COMPANY_EPI_2026_V3",
      issuedAt: new Date(Date.now() - i * 86400000).toISOString(),
      organizationName: data.organization.name,
      employee: structuredClone(data.employees[i]),
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
  private event(action: string, id: string) {
    this.data.audits.unshift({
      id: crypto.randomUUID(),
      action,
      entity_id: id,
      created_at: new Date().toISOString(),
      detail: { demo: true },
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
    };
    if (id)
      Object.assign(this.data.employees.find((e) => e.id === id) ?? {}, value);
    else this.data.employees.push(value);
    this.event("EMPLOYEE_SAVED", value.id);
    return value;
  }
  movement(
    variantId: string,
    quantity: number,
    reason: string,
    adjust = false,
  ) {
    this.require(STOCK);
    const balance = this.data.inventory.find((l) => l.id === variantId);
    if (
      !balance ||
      !Number.isInteger(quantity) ||
      quantity === 0 ||
      Math.abs(quantity) > 100000 ||
      (!adjust && quantity < 1)
    )
      throw new Error("Selecione equipamento e quantidade válidos.");
    if (adjust && reason.trim().length < 5)
      throw new Error("Informe uma justificativa de ao menos 5 caracteres.");
    if (this.available(balance) + quantity < 0)
      throw new Error(
        "Saldo insuficiente. Existem unidades reservadas ou bloqueadas.",
      );
    balance.stock_quantity += quantity;
    this.data.movements.unshift({
      id: crypto.randomUUID(),
      variant_id: balance.id,
      type: adjust ? "ADJUSTMENT" : "RECEIPT",
      quantity,
      reason,
      created_at: new Date().toISOString(),
    });
    this.event(adjust ? "STOCK_ADJUSTED" : "STOCK_RECEIVED", balance.id);
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
      if (item.quantity !== 1)
        throw new Error("Quantidade por item deve ser 1.");
      if (item.deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.deliveryDate))
        throw new Error("Data da entrega inválida.");
      const balance = this.data.inventory.find((l) => l.id === item.variantId);
      const variant = this.data.variants.find((v) => v.id === item.variantId);
      const product = this.data.products.find(
        (p) => p.id === variant?.product_id && p.active,
      );
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
        template: "COMPANY_EPI_2026_V3",
        recordNumber,
        issuedAt,
        organizationName: this.data.organization.name,
        employee: structuredClone(employee),
        documentDate: date,
        method,
        items: items.map((i) => {
          const v = this.data.variants.find((v) => v.id === i.variantId);
          const p = this.data.products.find((p) => p.id === v.product_id);
          return {
            description: i.description ?? p.description,
            ca: i.ca ?? p.ca,
            brand: i.brand ?? p.brand,
            risk: i.risk ?? p.risk_code ?? "",
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
        created_at: new Date().toISOString(),
        reason: note,
      });
    }
    state.receipt_status = "CONFIRMED";
    state.reservation_status = "DELIVERED";
    state.confirmed_at = new Date().toISOString();
    this.event("RECEIPT_CONFIRMED", id);
  }
  cancel(id: string) {
    this.require(HR);
    const sheet = this.data.sheets.find((s) => s.id === id);
    const state = this.data.states.find((s) => s.sheet_id === id);
    if (!sheet || !state || state.reservation_status !== "RESERVED")
      throw new Error("Apenas reservas pendentes podem ser canceladas.");
    for (const item of sheet.items ?? [])
      this.data.inventory.find((l) => l.id === item.variantId)
        .reserved_quantity--;
    state.reservation_status = "CANCELLED";
    this.event("RESERVATION_CANCELLED", id);
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
    this.event("SIMULATED_SIGNATURE", id);
  }
}
