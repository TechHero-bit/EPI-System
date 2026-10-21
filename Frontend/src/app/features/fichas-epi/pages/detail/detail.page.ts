import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
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
  signatureNote = "";
  receiptNote = "";
  cancelNote = "";
  url = "";
  timer?: ReturnType<typeof setInterval>;
  get state() {
    return this.s.state(this.id);
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
  manual() {
    void this.s.action(
      () => this.s.manual(this.id, this.signatureNote),
      "Registro presencial concluído.",
    );
  }
  receipt() {
    void this.s.action(
      () => this.s.receipt(this.id, this.receiptNote),
      "Entrega confirmada e estoque atualizado.",
    );
  }
  cancel() {
    void this.s.action(
      () => this.s.cancel(this.id, this.cancelNote),
      "Reserva cancelada.",
    );
  }
  link() {
    void this.s.action(async () => {
      this.url = await this.s.signingLink(this.id);
    }, "");
  }
  copy() {
    void this.s.action(
      () => navigator.clipboard.writeText(this.url),
      "Link copiado.",
    );
  }
  attach(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void this.s.action(async () => {
      if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024)
        throw new Error("Use um PDF de até 5 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await this.s.request(`/api/sheets/${this.id}/attachment`, "POST", {
        content: btoa(binary),
      });
    }, "Documento digitalizado anexado ao bucket privado.");
  }
}
