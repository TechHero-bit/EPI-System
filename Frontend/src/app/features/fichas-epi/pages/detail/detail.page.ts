import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
import { SIGNATURE_STYLES } from "../../../../../../../contracts/signature.mjs";
@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusComponent],
  templateUrl: "./detail.page.html",
})
export class DetailComponent implements OnInit, OnDestroy {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get("id")!;
  sheet: any;
  get signatureFont() {
    return SIGNATURE_STYLES.find(
      (style) => style.id === this.sheet?.electronic_signature?.signatureStyle,
    )?.font;
  }
  receiptNote = "";
  cancelNote = "";
  timer?: ReturnType<typeof setInterval>;
  get state() {
    return this.s.state(this.id);
  }
  get needsReceiptConfirmation() {
    return (
      this.state?.reservation_status !== "CANCELLED" &&
      (this.state?.receipt_status !== "CONFIRMED" ||
        (this.sheet?.signature_method === "MANUAL" &&
          this.state?.signature_status === "PENDING"))
    );
  }
  get audits() {
    return this.s.data().audits.filter((a) => a.entity_id === this.id);
  }
  async ngOnInit() {
    await this.s.action(async () => {
      this.sheet = await this.s.sheet(this.id);
    }, "");
    this.timer = setInterval(() => {
      if (!document.hidden) void this.s.load().catch(() => {});
    }, 15000);
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  download(kind: "pdf" | "xlsx") {
    void this.s.action(() => this.s.download(this.id, kind), "");
  }
  receipt() {
    void this.s.action(
      () => this.s.receipt(this.id, this.receiptNote),
      this.sheet?.signature_method === "MANUAL"
        ? "Entrega e assinatura presencial confirmadas."
        : "Entrega confirmada e estoque atualizado.",
    );
  }
  cancel() {
    void this.s.action(
      () => this.s.cancel(this.id, this.cancelNote),
      "Reserva cancelada.",
    );
  }
}
