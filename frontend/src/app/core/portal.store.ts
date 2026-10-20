import { Injectable, signal } from "@angular/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DemoRepository, makeDemoData } from "./demo-repository";
import { emptyData, type Role, type DraftItem, roleNames } from "./models";

declare global {
  interface Window {
    EPI_ERP_CONFIG?: { apiBaseUrl?: string; appMode?: "demo" | "real" };
  }
}
@Injectable({ providedIn: "root" })
export class PortalStore {
  readonly mode = window.EPI_ERP_CONFIG?.appMode ?? "demo";
  readonly demo = this.mode === "demo";
  readonly data = signal(emptyData());
  readonly user = signal("");
  readonly busy = signal(false);
  readonly failure = signal("");
  readonly message = signal("");
  private client?: SupabaseClient;
  private base = (window.EPI_ERP_CONFIG?.apiBaseUrl ?? "").replace(/\/$/, "");
  private repository = new DemoRepository();
  private initialization?: Promise<void>;
  get role() {
    return this.data().role;
  }
  get roleName() {
    return roleNames[this.role];
  }
  async init() {
    return (this.initialization ??= this.initialize());
  }
  private async initialize() {
    if (this.demo) {
      try {
        const raw = localStorage.getItem("epi-demo-v2");
        if (raw) this.repository = new DemoRepository(JSON.parse(raw));
      } catch {
        localStorage.removeItem("epi-demo-v2");
      }
      const role = sessionStorage.getItem("epi-demo-role") as Role | null;
      if (role && ["RH", "ALMOXARIFADO"].includes(role)) {
        this.repository.data.role = role;
        this.user.set("visitante@example.invalid");
        this.data.set(structuredClone(this.repository.data));
      } else {
        sessionStorage.removeItem("epi-demo-role");
      }
      return;
    }
    const config = await this.request("/api/config", "GET", undefined, false);
    this.client = createClient(config.supabaseUrl, config.publishableKey);
    const { data } = await this.client.auth.getSession();
    this.user.set(data.session?.user.email ?? "");
    this.client.auth.onAuthStateChange((event, session) => {
      this.user.set(session?.user.email ?? "");
      if (event === "SIGNED_OUT") this.data.set(emptyData());
    });
    if (this.user()) await this.load();
  }
  async login(email: string, password: string, role: Role) {
    await this.init();
    if (this.demo) {
      this.repository.data.role = role;
      sessionStorage.setItem("epi-demo-role", role);
      this.user.set("visitante@example.invalid");
      this.persist();
      return;
    }
    const result = await this.client!.auth.signInWithPassword({
      email,
      password,
    });
    if (result.error) throw result.error;
    this.user.set(result.data.user.email ?? "");
    await this.load();
  }
  async logout() {
    if (!this.demo) await this.client?.auth.signOut();
    sessionStorage.removeItem("epi-demo-role");
    this.user.set("");
    this.data.set(emptyData());
  }
  async recover(email: string) {
    if (this.demo)
      throw new Error("Recuperação de acesso está disponível no modo real.");
    await this.init();
    if (!email) throw new Error("Informe seu e-mail.");
    const { error } = await this.client!.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + "/login?recovery=1",
    });
    if (error) throw error;
    this.message.set(
      "Se a conta existir, você receberá as instruções de recuperação.",
    );
  }
  async updatePassword(password: string) {
    if (password.length < 12)
      throw new Error("Use uma senha com ao menos 12 caracteres.");
    const { error } = await this.client!.auth.updateUser({ password });
    if (error) throw error;
    this.message.set("Senha atualizada.");
  }
  async load() {
    if (this.demo) {
      this.data.set(structuredClone(this.repository.data));
      return;
    }
    const data = await this.request("/api/bootstrap");
    if (data.role === "SEGURANCA") data.role = "SEGURANCA_TRABALHO";
    this.data.set(data);
  }
  private persist() {
    localStorage.setItem("epi-demo-v2", JSON.stringify(this.repository.data));
    this.data.set(structuredClone(this.repository.data));
  }
  resetDemo() {
    if (!this.demo) return;
    this.repository = new DemoRepository(makeDemoData());
    this.repository.data.role = this.role;
    this.persist();
    this.message.set("Dados fictícios restaurados.");
  }
  async action(task: () => Promise<unknown>, message = "Operação concluída.") {
    this.busy.set(true);
    this.failure.set("");
    this.message.set("");
    try {
      await task();
      if (message) this.message.set(message);
      return true;
    } catch (e) {
      this.failure.set(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir a operação.",
      );
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  product(id: string) {
    return this.data().products.find((p) => p.id === id);
  }
  variant(id: string) {
    return this.data().variants.find((v) => v.id === id);
  }
  employee(id: string) {
    return this.data().employees.find((e) => e.id === id);
  }
  state(id: string) {
    return this.data().states.find((s) => s.sheet_id === id);
  }
  available(lot: any) {
    return lot.stock_quantity - (lot.reserved_quantity ?? 0);
  }
  stock(id: string) {
    return this.data()
      .lots.filter((l) => l.variant_id === id)
      .reduce((n, l) => n + this.available(l), 0);
  }
  async saveProduct(body: any, id?: string) {
    let product: any;
    if (this.demo) {
      product = this.repository.product(body, id);
      this.persist();
    } else {
      product = await this.request(
        id ? `/api/products/${id}` : "/api/products",
        id ? "PATCH" : "POST",
        body,
      );
      await this.load();
    }
    return product;
  }
  async saveEmployee(body: any, id?: string) {
    if (this.demo) {
      this.repository.employee(body, id);
      this.persist();
    } else {
      await this.request(
        id ? `/api/employees/${id}` : "/api/employees",
        id ? "PATCH" : "POST",
        body,
      );
      await this.load();
    }
  }
  async addVariant(body: any) {
    if (this.demo) {
      if (!["ADMIN", "ALMOXARIFADO"].includes(this.role))
        throw new Error("Acesso negado.");
      if (this.repository.data.variants.some((v) => v.sku === body.sku))
        throw new Error("SKU já cadastrado.");
      this.repository.data.variants.push({
        id: crypto.randomUUID(),
        product_id: body.productId,
        size: body.size,
        sku: body.sku,
        minimum_stock: body.minimumStock,
      });
      this.persist();
    } else {
      await this.request("/api/variants", "POST", body);
      await this.load();
    }
  }
  async addLot(body: any) {
    if (this.demo) {
      if (!["ADMIN", "ALMOXARIFADO"].includes(this.role))
        throw new Error("Acesso negado.");
      this.repository.data.lots.push({
        id: crypto.randomUUID(),
        variant_id: body.variantId,
        batch_code: body.batchCode,
        supplier: body.supplier,
        received_at: body.receivedAt,
        expires_at: body.expiresAt || null,
        stock_quantity: 0,
        reserved_quantity: 0,
        location: body.location,
        unit_cost: body.unitCost,
        condition: body.condition,
      });
      this.persist();
    } else {
      await this.request("/api/lots", "POST", body);
      await this.load();
    }
  }
  async movement(
    id: string,
    quantity: number,
    reason: string,
    adjust: boolean,
    key: string,
  ) {
    if (this.demo) {
      this.repository.movement(id, quantity, reason, adjust);
      this.persist();
    } else {
      await this.request(
        `/api/lots/${id}/${adjust ? "adjust" : "receive"}`,
        "POST",
        { quantity, reason, idempotencyKey: key },
      );
      await this.load();
    }
  }
  async issue(
    employeeId: string,
    items: DraftItem[],
    method: string,
    documentDate: string,
    key: string,
  ) {
    let value;
    if (this.demo) {
      value = this.repository.issue(
        employeeId,
        items,
        method,
        documentDate,
        key,
      );
      this.persist();
    } else {
      value = await this.request("/api/sheets", "POST", {
        employeeId,
        items,
        method,
        documentDate,
        idempotencyKey: key,
      });
      await this.load();
    }
    return value;
  }
  async sheet(id: string) {
    return this.demo
      ? this.data().sheets.find((s) => s.id === id)
      : this.request(`/api/sheets/${id}`);
  }
  async receipt(id: string, note: string) {
    if (this.demo) {
      this.repository.receipt(id, note);
      this.persist();
    } else {
      await this.request(`/api/sheets/${id}/receipt`, "POST", {
        method: "IN_PERSON",
        note,
      });
      await this.load();
    }
  }
  async cancel(id: string, note: string) {
    if (this.demo) {
      this.repository.cancel(id);
      this.persist();
    } else {
      await this.request(`/api/sheets/${id}/cancel`, "POST", { note });
      await this.load();
    }
  }
  async manual(id: string, note: string) {
    if (!note.trim())
      throw new Error("Informe onde o documento está arquivado.");
    if (this.demo) {
      this.repository.sign(id, true);
      this.persist();
    } else {
      await this.request(`/api/sheets/${id}/manual-signature`, "POST", {
        note,
      });
      await this.load();
    }
  }
  async signingLink(id: string) {
    if (this.demo) return `${location.origin}/assinar/demo-${id}`;
    return (await this.request(`/api/sheets/${id}/signing-links`, "POST", {}))
      .url;
  }
  async download(id: string, kind: "pdf" | "xlsx") {
    let bytes: Blob;
    if (this.demo) {
      const { demoDocument } = await import("../shared/demo-document");
      bytes = await demoDocument(
        this.data().sheets.find((s) => s.id === id),
        kind,
      );
    } else {
      const session = (await this.client!.auth.getSession()).data.session;
      const res = await fetch(`${this.base}/api/sheets/${id}/${kind}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Não foi possível baixar o documento.");
      bytes = await res.blob();
    }
    const url = URL.createObjectURL(bytes);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${this.demo ? "DEMO-" : ""}ficha-${id}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async publicAction(token: string, step: string, body?: any) {
    if (!this.demo)
      return this.request(
        `/api/sign/${encodeURIComponent(token)}${step ? "/" + step : ""}`,
        step ? "POST" : "GET",
        body,
        false,
      );
    if (!token.startsWith("demo-"))
      throw new Error("Este link requer o ambiente real.");
    const id = token.slice(5);
    const sheet = this.repository.data.sheets.find((s) => s.id === id);
    if (!sheet)
      throw new Error(
        "Exemplo não encontrado. Entre na demonstração para gerar um link.",
      );
    if (step === "confirm") {
      this.repository.sign(id);
      this.persist();
    }
    return {
      sheet,
      terms:
        "Simular o aceite de um documento fictício. Esta ação não produz uma assinatura juridicamente válida.",
      sha256: "DEMONSTRAÇÃO",
      pending: true,
    };
  }
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ): Promise<any> {
    const session = authenticated
      ? (await this.client?.auth.getSession())?.data.session
      : null;
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        value.error ?? `Falha ao acessar a API (${response.status}).`,
      );
    return value;
  }
}
