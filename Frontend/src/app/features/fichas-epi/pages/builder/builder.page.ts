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
import { sizeGroupsFor } from "../../../../../../../contracts/equipment-sizes.mjs";
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

  // Kit do cliente e função: itens vêm marcados; o operador escolhe o tamanho.
  kitRows: { productId: string; size: string; include: boolean }[] = [];
  private kitEmployee = "";
  get kit() {
    return this.s.kitFor(this.s.employee(this.employeeId));
  }
  prepareKit() {
    if (this.preparedId || this.kitEmployee === this.employeeId) return;
    this.kitEmployee = this.employeeId;
    this.kitRows = (this.kit?.items ?? []).flatMap((item: { product_id: string; quantity: number }) =>
      Array.from({ length: item.quantity }, () => ({
        productId: item.product_id,
        size: "",
        include: true,
      })),
    );
    for (const row of this.kitRows) {
      row.include = this.kitHasStock(row.productId);
      const sizes = this.kitSizes(row.productId);
      if (sizes.length === 1 && this.available(sizes[0].id) > 0)
        row.size = sizes[0].size;
    }
  }
  kitSizes(productId: string) {
    const product = this.s.product(productId);
    if (!product?.active) return [];
    return this.s
      .data()
      .variants.filter((v) => v.product_id === productId && v.active !== false);
  }
  kitHasStock(productId: string) {
    return this.kitSizes(productId).some((v) => this.available(v.id) > 0);
  }
  addKit() {
    const failures: string[] = [];
    const added: typeof this.kitRows = [];
    for (const row of this.kitRows.filter((r) => r.include)) {
      const name = this.s.product(row.productId)?.description ?? "EPI";
      const variant = this.kitSizes(row.productId).find((v) => v.size === row.size);
      if (!variant) failures.push(`${name}: escolha o tamanho`);
      else if (this.available(variant.id) < 1)
        failures.push(`${name} ${row.size}: sem estoque`);
      else if (this.draft.length >= 15) failures.push(`${name}: limite de 15 itens`);
      else {
        this.draft.push({ variantId: variant.id, quantity: 1 });
        added.push(row);
      }
    }
    this.kitRows = this.kitRows.filter((row) => !added.includes(row));
    if (failures.length)
      this.s.failure.set(`Itens não incluídos: ${failures.join("; ")}.`);
    else if (added.length) {
      this.s.failure.set("");
      this.s.message.set(`${added.length} itens do kit incluídos na ficha.`);
    }
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
    if (target === 2) this.prepareKit();
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
