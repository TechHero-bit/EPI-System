import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../../../core/services/portal.service";
import { alphabetical } from "../../../../shared/utils/alphabetical";

// Kit de EPIs por cliente e função: ponto de partida do montador de fichas.
@Component({
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./kits.page.html",
})
export class KitsComponent {
  s = inject(PortalStore);
  clientId = "";
  jobTitle = "";
  editingId = "";
  quantities: Record<string, number> = {};
  get canEdit() {
    return ["ADMIN", "RH"].includes(this.s.role);
  }
  get clients() {
    return alphabetical(
      (this.s.data().clients ?? []).filter((c) => c.active || c.id === this.clientId),
      (c) => c.name,
    );
  }
  /** Funções já usadas nos cadastros, para sugerir o texto exato. */
  get jobTitles() {
    return [...new Set(this.s.data().employees.map((e) => e.job_title).filter(Boolean))].sort();
  }
  get products() {
    return alphabetical(
      this.s.data().products.filter((p) => p.active),
      (p) => p.description,
    );
  }
  get kits() {
    return alphabetical(
      (this.s.data().kits ?? []).map((k) => ({
        ...k,
        client: this.s.listName("clients", k.client_id),
        items: (this.s.data().kitItems ?? []).filter((i) => i.kit_id === k.id),
      })),
      (k) => `${k.client} ${k.job_title}`,
    );
  }
  get total() {
    return Object.values(this.quantities).reduce((n, q) => n + (Number(q) || 0), 0);
  }
  productName(id: string) {
    return this.s.product(id)?.description ?? "Equipamento removido";
  }
  edit(kit: any) {
    this.editingId = kit.id;
    this.clientId = kit.client_id;
    this.jobTitle = kit.job_title;
    this.quantities = Object.fromEntries(kit.items.map((i: any) => [i.product_id, i.quantity]));
  }
  reset() {
    this.editingId = "";
    this.clientId = "";
    this.jobTitle = "";
    this.quantities = {};
  }
  save() {
    void this.s
      .action(async () => {
        const items = Object.entries(this.quantities)
          .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }))
          .filter((i) => i.quantity > 0);
        await this.s.saveKit(this.clientId, this.jobTitle, items);
      }, "Kit salvo.")
      .then((ok) => ok && this.reset());
  }
  remove(kit: any) {
    void this.s.action(() => this.s.deleteKit(kit.id), "Kit removido.");
  }
}
