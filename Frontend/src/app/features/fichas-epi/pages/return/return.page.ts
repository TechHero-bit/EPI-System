import { Component, inject, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { today } from "../../../../core/models/portal.model";
import {
  RETURN_DESTINATIONS,
  RETURN_REASONS,
  RETURNABLE_RESERVATION_STATUS,
  TERMINATION_REASON,
  returnReasonLabel,
} from "../../../../../../../contracts/returns.mjs";

type Row = {
  index: number;
  item: any;
  selected: boolean;
  reasonCode: number | null;
  destination: string;
};

// Devolução de ficha entregue: registro novo, com assinatura presencial; o snapshot não muda.
@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: "./return.page.html",
})
export class ReturnComponent implements OnInit {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  router = inject(Router);
  id = this.route.snapshot.paramMap.get("id")!;
  termination = this.route.snapshot.queryParamMap.get("desligamento") === "1";
  sheet: any;
  rows: Row[] = [];
  returnedOn = today();
  note = "";
  key = crypto.randomUUID();
  reasons = RETURN_REASONS;
  destinations = RETURN_DESTINATIONS;
  reasonLabel = returnReasonLabel;
  maxDate = today();
  get state() {
    return this.s.state(this.id);
  }
  get returnable() {
    return (RETURNABLE_RESERVATION_STATUS as readonly string[]).includes(
      this.state?.reservation_status ?? "",
    );
  }
  get selected() {
    return this.rows.filter((r) => r.selected);
  }
  get ready() {
    return (
      this.selected.length > 0 &&
      this.selected.every((r) => r.reasonCode && r.destination) &&
      !!this.note.trim() &&
      !!this.returnedOn
    );
  }
  returnedItem(index: number) {
    for (const r of this.sheet?.returns ?? [])
      for (const i of r.items)
        if (i.item_index === index) return { ...i, returned_on: r.returned_on };
    return undefined;
  }
  async ngOnInit() {
    await this.s.action(() => this.loadSheet(), "");
  }
  private async loadSheet() {
    this.sheet = await this.s.sheet(this.id);
    if (!this.sheet) throw new Error("Ficha não encontrada.");
    this.rows = (this.sheet.snapshot?.items ?? []).map((item: any, index: number) => ({
      index,
      item,
      selected: this.termination && !this.returnedItem(index),
      reasonCode: this.termination ? TERMINATION_REASON : null,
      destination: "",
    }));
  }
  save() {
    void this.s.action(async () => {
      if (!this.ready)
        throw new Error("Escolha os itens, o motivo e o destino de cada um e informe a assinatura presencial.");
      await this.s.registerReturn(this.id, {
        returnedOn: this.returnedOn,
        note: this.note.trim(),
        termination: this.termination,
        idempotencyKey: this.key,
        items: this.selected.map((r) => ({
          index: r.index,
          reasonCode: Number(r.reasonCode),
          destination: r.destination,
        })),
      });
      this.key = crypto.randomUUID();
      await this.router.navigate(["/rh/fichas", this.id]);
    }, "Devolução registrada.");
  }
}
