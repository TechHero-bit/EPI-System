import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  OnInit,
  OnDestroy,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, ActivatedRoute } from "@angular/router";
import { DatePipe } from "@angular/common";
import {
  alphabetical,
  compareLabels,
} from "../../../../shared/utils/alphabetical";
import { PortalStore } from "../../../../core/services/portal.service";
import { today, type DraftItem } from "../../../../core/models/portal.model";
import { restoreReviewDraft } from "../../../../shared/utils/review-draft";
import {
  SIZE_GROUPS,
  sizeGroupsFor,
} from "../../../../../../../contracts/equipment-sizes.mjs";

const SIZE_ORDER: string[] = SIZE_GROUPS.flatMap((g) => [...g.sizes]);

/** Situação de um item do kit diante do estoque e do que já está na ficha. */
interface KitRow {
  productId: string;
  name: string;
  ca: string;
  quantity: number;
  inDraft: number;
  remaining: number;
  variants: any[];
  /** Equipamento com tamanho de verdade: sempre espera a escolha na ficha (só "Único" entra direto). */
  pickSize: boolean;
  severity: "OK" | "NORMAL" | "WARNING" | "CRITICAL";
  status: string;
  /** Falta de estoque, C.A. vencido ou equipamento inativo. */
  missing: boolean;
}
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: "./builder.page.html",
  styleUrl: "./builder.page.css",
})
export class BuilderComponent implements OnInit, OnDestroy {
  @ViewChild("selectionDialog") selectionDialog!: ElementRef<HTMLDialogElement>;
  s = inject(PortalStore);
  router = inject(Router);
  route = inject(ActivatedRoute);
  employeeId = "";
  employeeQuery = "";
  query = "";
  category = "";
  size = "";
  get sizeGroups() {
    return sizeGroupsFor(
      this.s
        .data()
        .variants.filter((v) => {
          const product = this.s.product(v.product_id);
          return (
            product?.active &&
            v.active !== false &&
            (!this.category || product.category === this.category)
          );
        })
        .map((v) => v.size),
    );
  }
  /** A lista completa só aparece depois de pesquisar ou filtrar. */
  browsing = false;
  // "Todas as categorias" também limpa o tamanho dependente: antes o tamanho
  // escolhido continuava aplicado e a opção "todas" não devolvia todos os itens.
  categoryChanged(category: string) {
    this.category = category;
    this.browsing = true;
    if (
      !category ||
      !this.sizeGroups.some((group) => group.sizes.includes(this.size))
    )
      this.size = "";
  }
  sizeChanged(size: string) {
    this.size = size;
    this.browsing = true;
  }
  queryChanged(query: string) {
    this.query = query;
    if (query.trim()) this.browsing = true;
  }
  showAll() {
    this.category = "";
    this.size = "";
    this.query = "";
    this.browsing = true;
  }
  clearFilters() {
    this.category = "";
    this.size = "";
    this.query = "";
    this.browsing = false;
  }

  // Kit / cliente: puxa os itens do kit e mostra o que está em falta.
  kitId = "";
  /** Itens que o kit colocou na ficha automaticamente (saem se o kit for desmarcado). */
  private kitAdded = new Set<DraftItem>();
  jobLabel(jobTitle: string | null | undefined) {
    return jobTitle?.trim() || "Kit geral";
  }
  get kitOptions() {
    return alphabetical(
      (this.s.data().kits ?? []).map((k) => ({
        id: k.id as string,
        label: `${this.s.listName("clients", k.client_id) || "Cliente removido"} · ${this.jobLabel(k.job_title)}`,
      })),
      (k) => k.label,
    );
  }
  /** Kit do cliente e função do colaborador (ou o kit geral do cliente). */
  get suggestedKit() {
    return this.s.kitFor(this.s.employee(this.employeeId));
  }
  /**
   * O kit guarda o equipamento sem tamanho. Na ficha, valem todos os equipamentos ativos
   * com o mesmo C.A. (ex.: uma bota cadastrada por tamanho, todas com o mesmo C.A.).
   */
  private sameEquipment(productId: string) {
    const ca = this.s.product(productId)?.ca?.trim().toLowerCase();
    if (!ca) return new Set([productId]);
    return new Set([
      productId,
      ...this.s
        .data()
        .products.filter((p) => p.active && p.ca?.trim().toLowerCase() === ca)
        .map((p) => p.id as string),
    ]);
  }
  private inDraft(products: Set<string>) {
    return this.draft.filter((item) =>
      products.has(this.s.variant(item.variantId)?.product_id),
    ).length;
  }
  /** Rótulo do tamanho; repete o nome só quando dois equipamentos do grupo têm o mesmo tamanho. */
  sizeLabel(row: KitRow, v: any) {
    const clash = row.variants.some((o) => o !== v && o.size === v.size);
    return clash ? `${v.size} · ${this.s.product(v.product_id)?.description ?? ""}` : v.size;
  }
  get kitRows(): KitRow[] {
    return (this.s.data().kitItems ?? [])
      .filter((i) => i.kit_id === this.kitId)
      .map((item): KitRow => {
        const p = this.s.product(item.product_id);
        const products = this.sameEquipment(item.product_id);
        const variants = this.s
          .data()
          .variants.filter(
            (v) =>
              products.has(v.product_id) &&
              v.active !== false &&
              this.s.product(v.product_id)?.active,
          )
          .sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
        const inDraft = this.inDraft(products);
        const remaining = Math.max(0, item.quantity - inDraft);
        const stockLeft = variants.reduce((n, v) => n + Math.max(0, this.available(v.id)), 0);
        const row = {
          productId: item.product_id,
          name: p?.description ?? "Equipamento removido",
          ca: p?.ca ?? "",
          quantity: item.quantity,
          inDraft,
          remaining,
          variants,
          pickSize: variants.some((v) => v.size !== "Único"),
        };
        const state = (severity: KitRow["severity"], status: string, missing: boolean) => ({
          ...row,
          severity,
          status,
          missing,
        });
        if (!variants.length) return state("CRITICAL", "Equipamento inativo", true);
        if (p.ca_expires_at && p.ca_expires_at < today()) return state("CRITICAL", "C.A. vencido", true);
        if (!remaining) return state("OK", "Completo na ficha", false);
        if (!stockLeft) return state("CRITICAL", "Em falta no estoque", true);
        if (stockLeft < remaining)
          return state("WARNING", `Estoque insuficiente: ${stockLeft} de ${remaining} un.`, true);
        return state("NORMAL", row.pickSize ? "Escolha o tamanho" : "Disponível", false);
      });
  }
  get kitMissing() {
    return this.kitRows.filter((r) => r.missing);
  }
  /** Colaborador para o qual o kit sugerido já foi aplicado. */
  private kitEmployeeId = "";
  /**
   * Ao entrar na etapa 2, já traz o kit do colaborador (cliente + função ou kit geral).
   * Trocar de colaborador troca o kit, desde que a ficha só tenha itens vindos do kit.
   */
  private applySuggestedKit() {
    if (this.preparedId || this.kitEmployeeId === this.employeeId) return;
    if (this.draft.some((item) => !this.kitAdded.has(item))) return;
    this.kitEmployeeId = this.employeeId;
    this.selectKit(this.suggestedKit?.id ?? "");
  }
  /**
   * Escolher um kit já adiciona os itens de tamanho "Único" com estoque;
   * os demais (mesmo com um só tamanho cadastrado) esperam a escolha do tamanho.
   */
  selectKit(id: string) {
    if (this.preparedId) return;
    // Trocar de kit (ou voltar para "Sem kit") desfaz o que o kit anterior adicionou sozinho.
    if (this.kitAdded.size) {
      this.draft = this.draft.filter((item) => !this.kitAdded.has(item));
      this.kitAdded.clear();
    }
    this.kitId = id;
    if (!id) {
      this.s.message.set("");
      return;
    }
    let added = 0;
    for (const row of this.kitRows) {
      // Com estoque parcial, adiciona o que houver; available() já zera C.A. vencido e inativos.
      if (row.pickSize || row.variants.length !== 1) continue;
      const v = row.variants[0];
      for (let n = 0; n < row.remaining && this.draft.length < 15 && this.available(v.id) > 0; n++) {
        const item: DraftItem = { variantId: v.id, quantity: 1 };
        this.draft.push(item);
        this.kitAdded.add(item);
        added++;
      }
    }
    const rows = this.kitRows;
    const missing = rows.filter((r) => r.missing).length;
    this.s.message.set(
      [
        added
          ? `${added} ${added === 1 ? "unidade adicionada" : "unidades adicionadas"} do kit.`
          : "Kit selecionado.",
        rows.some((r) => r.remaining && !r.missing) ? "Escolha o tamanho dos itens restantes." : "",
        missing ? `${missing} ${missing === 1 ? "item em falta" : "itens em falta"}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  step = 1;
  date = today();
  method = "MANUAL";
  draft: DraftItem[] = [];
  key = crypto.randomUUID();
  preparedId = "";
  prepared: any;
  url = "";
  qr = "";
  cancelNote = "";
  refreshing = false;
  editTarget: number | null = null;
  timer?: ReturnType<typeof setInterval>;
  get employee() {
    return (
      this.prepared?.snapshot?.employee ?? this.s.employee(this.employeeId)
    );
  }
  get state() {
    return this.s.state(this.preparedId);
  }
  get pending() {
    return (
      this.state?.signature_status === "PENDING" &&
      this.state?.reservation_status !== "CANCELLED"
    );
  }
  get canFinish() {
    return (
      !!this.prepared &&
      this.state?.reservation_status !== "CANCELLED" &&
      (this.method === "MANUAL" ||
        this.state?.signature_status === "SIGNED_ELECTRONIC")
    );
  }
  get canRevise() {
    return (
      !!this.prepared &&
      this.state?.signature_status === "PENDING" &&
      this.state?.reservation_status === "RESERVED" &&
      this.state?.receipt_status === "UNCONFIRMED"
    );
  }
  back() {
    if (this.preparedId && !this.prepared) {
      void this.router.navigate(["/rh/fichas"]);
      return;
    }
    if (this.step === 1) {
      void this.router.navigate(["/rh/fichas"]);
      return;
    }
    this.goTo(this.step - 1);
  }
  goTo(target: number) {
    if (this.s.busy() || target < 1 || target > 3) return;
    if (target === 2 && !this.employeeId) return;
    if (target === 3 && !this.draft.length && !this.preparedId) return;
    if (target === 3 && this.step < 3 && !this.preparedId) {
      this.selectionDialog.nativeElement.showModal();
      return;
    }
    if (this.preparedId && target < this.step && this.canRevise) {
      this.editTarget = target;
      return;
    }
    this.step = target;
    if (target === 2) this.applySuggestedKit();
  }
  confirmSelection() {
    if (this.s.busy() || !this.draft.length || !this.employeeId) return;
    this.selectionDialog.nativeElement.close();
    this.step = 3;
  }
  requestEdit() {
    if (this.canRevise) this.editTarget = 3;
    else if (!this.preparedId) this.back();
  }
  async confirmBack() {
    const target = this.editTarget;
    if (target === null) return;
    await this.s.action(async () => {
      const restored = restoreReviewDraft(this.prepared);
      await this.s.load();
      if (!this.canRevise) {
        this.editTarget = null;
        this.step = target;
        this.s.failure.set(
          "O estado desta ficha mudou. As etapas anteriores estão disponíveis somente para consulta.",
        );
        return;
      }
      await this.s.cancel(
        this.preparedId,
        "Retorno para edição das etapas da ficha; versão pendente substituída por novo rascunho.",
      );
      this.editTarget = null;
      if (this.state?.signature_status !== "PENDING") {
        this.step = target;
        this.s.failure.set(
          "Uma assinatura foi registrada durante o retorno. O documento foi preservado e a reserva foi cancelada; esta versão permanece somente para consulta.",
        );
        return;
      }
      this.employeeId = restored.employeeId;
      // O rascunho restaurado já tem os itens escolhidos; não reaplica o kit por cima.
      this.kitEmployeeId = restored.employeeId;
      this.date = restored.date;
      this.method = restored.method;
      this.draft = restored.items;
      this.preparedId = "";
      this.prepared = undefined;
      this.url = "";
      this.qr = "";
      this.cancelNote = "";
      this.key = crypto.randomUUID();
      this.step = target;
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });
      this.s.message.set(
        "Dados preservados em um novo rascunho. Você pode alterar o método de assinatura e as etapas anteriores.",
      );
    }, "");
  }
  get selectedItems(): any[] {
    return (
      this.prepared?.snapshot?.items ??
      this.draft.map((item) => {
        const v = this.s.variant(item.variantId),
          p = this.s.product(v?.product_id);
        return {
          ...item,
          description: p?.description,
          ca: p?.ca,
          brand: p?.brand,
          risk: p?.risk_code,
          size: v?.size,
        };
      })
    );
  }
  async ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get("ficha");
    if (id) await this.s.action(() => this.resume(id), "");
    this.timer = setInterval(() => {
      if (this.preparedId && !document.hidden && !this.s.busy())
        void this.refresh();
    }, 5000);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  reload() {
    void this.s.action(() => this.resume(this.preparedId), "");
  }
  async resume(id: string) {
    this.preparedId = id;
    this.step = 3;
    this.prepared = await this.s.sheet(id);
    if (!this.prepared) throw new Error("Ficha não encontrada.");
    this.employeeId = this.prepared.employee_id;
    this.method = this.prepared.signature_method;
    this.date = this.prepared.snapshot.documentDate;
    await this.s.load();
  }
  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.s.load();
    } catch (e) {
      this.s.failure.set(
        e instanceof Error
          ? e.message
          : "Falha ao consultar confirmação. Tente novamente.",
      );
    } finally {
      this.refreshing = false;
    }
  }
  async generateLink() {
    this.url = await this.s.signingLink(this.preparedId);
    this.qr = "";
    try {
      const { default: qr } = await import("qrcode");
      this.qr = await qr.toDataURL(this.url, {
        width: 256,
        margin: 4,
        errorCorrectionLevel: "M",
      });
    } catch {
      this.s.failure.set(
        "Não foi possível gerar o QR Code. Use o link de assinatura abaixo.",
      );
    }
  }
  link() {
    void this.s.action(
      () => this.generateLink(),
      "Link de assinatura preparado.",
    );
  }
  copy() {
    void this.s.action(
      () => navigator.clipboard.writeText(this.url),
      "Link copiado.",
    );
  }
  preview(kind: "pdf" | "xlsx" = "pdf") {
    void this.s.action(() => this.s.download(this.preparedId, kind), "");
  }
  finish() {
    if (!this.canFinish) {
      this.s.failure.set(
        "Aguarde a confirmação da assinatura antes de avançar.",
      );
      return;
    }
    void this.router.navigate(["/rh/fichas", this.preparedId]);
  }
  cancel() {
    void this.s.action(async () => {
      await this.s.cancel(this.preparedId, this.cancelNote);
      await this.router.navigate(["/rh/fichas"]);
    }, "Reserva cancelada. Inicie outra ficha para alterar o conteúdo.");
  }
  attach(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void this.s.action(async () => {
      if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024)
        throw new Error("Use um PDF de até 5 MB.");
      let content = "";
      for (const byte of new Uint8Array(await file.arrayBuffer()))
        content += String.fromCharCode(byte);
      await this.s.request(
        `/api/sheets/${this.preparedId}/attachment`,
        "POST",
        { content: btoa(content) },
      );
    }, "Documento digitalizado anexado.");
  }
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
  unavailableReason(id: string) {
    const p = this.s.product(this.s.variant(id)?.product_id);
    if (p?.ca_expires_at && p.ca_expires_at < today())
      return "C.A. vencido — não pode ser incluído";
    return "Sem estoque — não pode ser incluído";
  }
  get variants() {
    return alphabetical(
      this.s.data().variants.filter((v) => {
        const p = this.s.product(v.product_id);
        return (
          p?.active &&
          v.active !== false &&
          (!this.category || p.category === this.category) &&
          (!this.size || v.size === this.size) &&
          `${p.description} ${p.ca} ${p.brand} ${v.size}`
            .toLowerCase()
            .includes(this.query.toLowerCase())
        );
      }),
      (v) => `${this.s.product(v.product_id)?.description} · ${v.size}`,
    );
  }
  available(id: string) {
    const v = this.s.variant(id);
    const p = this.s.product(v?.product_id);
    if (v?.active === false || !p?.active) return 0;
    if (p?.ca_expires_at && p.ca_expires_at < today()) return 0;
    return (
      this.s.stock(id) -
      this.draft.filter((item) => item.variantId === id).length
    );
  }
  add(v: any) {
    if (this.preparedId) return;
    if (this.draft.length >= 15) {
      this.s.failure.set("Limite de 15 itens por ficha.");
      return;
    }
    if (this.available(v.id) < 1) {
      this.s.failure.set(
        "Item sem estoque disponível não pode ser incluído na ficha.",
      );
      return;
    }
    this.draft.push({
      variantId: v.id,
      quantity: 1,
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
      this.preparedId = value.id;
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ficha: value.id },
        replaceUrl: true,
      });
      await this.resume(value.id);
      if (this.method === "ELECTRONIC") await this.generateLink();
    }, "Ficha gerada. Os itens foram reservados.");
  }
}
