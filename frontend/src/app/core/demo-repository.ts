import {
  categories,
  emptyData,
  HR,
  STOCK,
  today,
  type DraftItem,
  type PortalData,
  type Role,
} from "./models";

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
  data.lots = data.variants.map((v, i) => ({
    id: `lot-${i}`,
    variant_id: v.id,
    batch_code: `DEMO-2026-${i + 1}`,
    supplier: "Fornecedor fictício",
    received_at: today(),
    expires_at: i === 2 ? "2026-11-10" : "2028-10-20",
    stock_quantity: [24, 3, 15, 8, 0, 18, 4, 12][i],
    reserved_quantity: 0,
    unit_cost: [89, 28, 15, 220, 110, 35, 12, 280][i],
    location: `A-${i + 1}`,
    condition: "NOVO",
  }));
  data.movements = data.lots.map((l, i) => ({
    id: `movement-${i}`,
    lot_id: l.id,
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
      employee: structuredClone(data.employees[i]),
      items: [
        {
          description: equipment[i],
          ca: data.products[i].ca,
          size: data.variants[i].size,
          lot: data.lots[i].batch_code,
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
      issued_at: new Date(Date.now() - i * 86400000).toISOString(),
      signature_method: snapshot.method,
      snapshot,
      items: [
        { variantId: `variant-${i}`, lotId: `lot-${i}`, quantity: 1, risk: "" },
      ],
      pdf_sha256: "Documento fictício — sem validade jurídica",
    });
    if (i !== 2) data.lots[i].reserved_quantity++;
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
  constructor(public data: PortalData = makeDemoData()) {}
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
  available(lot: any): number {
    return lot.stock_quantity - (lot.reserved_quantity ?? 0);
  }
  product(body: any, id?: string) {
    this.require(STOCK);
    if (!body.description?.trim() || !body.category?.trim())
      throw new Error("Informe nome e categoria.");
    const value = {
      id: id ?? crypto.randomUUID(),
      ...body,
      ca_expires_at: body.caExpiresAt || null,
      risk_code: body.riskCode ?? "",
      active: body.active ?? true,
      photo_url: body.photoUrl || null,
      useful_life_days: body.usefulLifeDays || null,
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
        (e) => e.registration === body.registration && e.id !== id,
      )
    )
      throw new Error("Matrícula já cadastrada.");
    const value = {
      id: id ?? crypto.randomUUID(),
      name: body.name,
      registration: body.registration,
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
  movement(lotId: string, quantity: number, reason: string, adjust = false) {
    this.require(STOCK);
    const lot = this.data.lots.find((l) => l.id === lotId);
    if (
      !lot ||
      !Number.isInteger(quantity) ||
      quantity === 0 ||
      Math.abs(quantity) > 100000 ||
      (!adjust && quantity < 1)
    )
      throw new Error("Selecione lote e quantidade válidos.");
    if (adjust && reason.trim().length < 5)
      throw new Error("Informe uma justificativa de ao menos 5 caracteres.");
    if (this.available(lot) + quantity < 0)
      throw new Error("Saldo insuficiente. Existem unidades reservadas.");
    lot.stock_quantity += quantity;
    this.data.movements.unshift({
      id: crypto.randomUUID(),
      lot_id: lot.id,
      type: adjust ? "ADJUSTMENT" : "RECEIPT",
      quantity,
      reason,
      created_at: new Date().toISOString(),
    });
    this.event(adjust ? "STOCK_ADJUSTED" : "STOCK_RECEIVED", lot.id);
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
      const lot = this.data.lots.find(
        (l) => l.id === item.lotId && l.variant_id === item.variantId,
      );
      const variant = this.data.variants.find((v) => v.id === item.variantId);
      const product = this.data.products.find(
        (p) => p.id === variant?.product_id && p.active,
      );
      const count = (demand.get(item.lotId) ?? 0) + 1;
      if (
        !lot ||
        !product ||
        this.available(lot) < count ||
        (lot.expires_at && lot.expires_at < today())
      )
        throw new Error("Estoque insuficiente ou lote vencido.");
      demand.set(item.lotId, count);
    }
    const sheet = {
      id: crypto.randomUUID(),
      employee_id: employeeId,
      version:
        this.data.sheets.filter((s) => s.employee_id === employeeId).length + 1,
      issued_at: new Date().toISOString(),
      signature_method: method,
      request_key: key,
      items: structuredClone(items),
      snapshot: {
        employee: structuredClone(employee),
        documentDate: date,
        method,
        items: items.map((i) => {
          const v = this.data.variants.find((v) => v.id === i.variantId);
          const p = this.data.products.find((p) => p.id === v.product_id);
          return {
            description: p.description,
            ca: p.ca,
            size: v.size,
            lot: this.data.lots.find((l) => l.id === i.lotId).batch_code,
            quantity: 1,
          };
        }),
      },
      pdf_sha256: "DEMONSTRAÇÃO — sem assinatura válida",
    };
    for (const [id, n] of demand) {
      const lot = this.data.lots.find((l) => l.id === id);
      lot.reserved_quantity = (lot.reserved_quantity ?? 0) + n;
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
      const lot = this.data.lots.find((l) => l.id === item.lotId);
      lot.stock_quantity--;
      lot.reserved_quantity--;
      this.data.movements.unshift({
        id: crypto.randomUUID(),
        lot_id: lot.id,
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
      this.data.lots.find((l) => l.id === item.lotId).reserved_quantity--;
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
