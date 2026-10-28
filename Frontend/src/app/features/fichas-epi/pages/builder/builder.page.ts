import { Component, inject, OnInit, OnDestroy } from "@angular/core";
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
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: "./builder.page.html",
})
export class BuilderComponent implements OnInit, OnDestroy {
  s = inject(PortalStore);
  router = inject(Router);
  route = inject(ActivatedRoute);
  employeeId = "";
  employeeQuery = "";
  query = "";
  category = "";
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
    if (this.preparedId && target < this.step && this.canRevise) {
      this.editTarget = target;
      return;
    }
    this.step = target;
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
      const qr = await import("qrcode");
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
  get variants() {
    return alphabetical(
      this.s.data().variants.filter((v) => {
        const p = this.s.product(v.product_id);
        return (
          p?.active &&
          (!this.category || p.category === this.category) &&
          `${p.description} ${p.ca} ${v.size}`
            .toLowerCase()
            .includes(this.query.toLowerCase())
        );
      }),
      (v) => `${this.s.product(v.product_id)?.description} · ${v.size}`,
    );
  }
  available(id: string) {
    const p = this.s.product(this.s.variant(id)?.product_id);
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
    if (this.available(v.id) < 1) return;
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
