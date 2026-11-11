import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { PortalStore } from "../../../../core/services/portal.service";
import { normalizeJobTitle } from "../../../../core/models/portal.model";
import {
  alphabetical,
  compareLabels,
} from "../../../../shared/utils/alphabetical";

const KIT_LIMIT = 15;

// Kit de EPIs por cliente e função: ponto de partida do montador de fichas.
// A escolha dos equipamentos segue o padrão do montador: filtros à esquerda,
// cartões que adicionam uma unidade e um resumo com as quantidades.
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
  /** productId → unidades, na ordem em que foram escolhidos. */
  items: { productId: string; quantity: number }[] = [];
  category = "";
  query = "";
  browsing = false;
  newClient = "";
  limit = KIT_LIMIT;
  get canEdit() {
    return ["ADMIN", "RH"].includes(this.s.role);
  }
  /** ADMIN e RH incluem clientes; renomear e desativar continua na Administração. */
  get canAddClient() {
    return ["ADMIN", "RH"].includes(this.s.role);
  }
  get clients() {
    return alphabetical(
      (this.s.data().clients ?? []).filter(
        (c) => c.active || c.id === this.clientId,
      ),
      (c) => c.name,
    );
  }
  get categories() {
    return [
      ...new Set(
        this.s
          .data()
          .products.filter((p) => p.active)
          .map((p) => p.category),
      ),
    ].sort(compareLabels);
  }
  /** Mesmo C.A. = mesmo equipamento no kit (cada tamanho pode ser um cadastro próprio). */
  private equipmentKey(productId: string) {
    const ca = this.s.product(productId)?.ca?.trim().toLowerCase();
    return ca ? `ca:${ca}` : `id:${productId}`;
  }
  private itemOf(productId: string) {
    const key = this.equipmentKey(productId);
    return this.items.find((i) => this.equipmentKey(i.productId) === key);
  }
  /** Um cartão por C.A.; o primeiro em ordem alfabética representa o grupo. */
  get products() {
    const q = this.query.trim().toLowerCase();
    const seen = new Set<string>();
    return alphabetical(
      this.s
        .data()
        .products.filter(
          (p) =>
            p.active &&
            (!this.category || p.category === this.category) &&
            `${p.description} ${p.ca ?? ""} ${p.brand ?? ""}`
              .toLowerCase()
              .includes(q),
        ),
      (p) => p.description,
    ).filter((p) => {
      const key = this.equipmentKey(p.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    return this.items.reduce((n, i) => n + i.quantity, 0);
  }
  get canSave() {
    return (
      !!this.clientId &&
      this.total > 0 &&
      this.total <= KIT_LIMIT
    );
  }
  /** Kit sem função vale para todo o cliente quando a função não tem kit próprio. */
  jobLabel(jobTitle: string) {
    return jobTitle?.trim() || "Kit geral (todas as funções)";
  }
  /** Já existe kit para este cliente e função? Salvar substitui os itens dele. */
  get replaces() {
    if (this.editingId) return undefined;
    const job = normalizeJobTitle(this.jobTitle);
    return (this.s.data().kits ?? []).find(
      (k) => k.client_id === this.clientId && normalizeJobTitle(k.job_title) === job,
    );
  }
  productName(id: string) {
    return this.s.product(id)?.description ?? "Equipamento removido";
  }
  quantityOf(productId: string) {
    return this.itemOf(productId)?.quantity ?? 0;
  }
  categoryChanged(category: string) {
    this.category = category;
    this.browsing = true;
  }
  queryChanged(query: string) {
    this.query = query;
    if (query.trim()) this.browsing = true;
  }
  showAll() {
    this.category = "";
    this.query = "";
    this.browsing = true;
  }
  add(productId: string) {
    if (this.total >= KIT_LIMIT) {
      this.s.failure.set(`O kit pode ter no máximo ${KIT_LIMIT} unidades, o limite da ficha.`);
      return;
    }
    const item = this.itemOf(productId);
    if (item) item.quantity++;
    else this.items.push({ productId, quantity: 1 });
  }
  decrease(productId: string) {
    const item = this.items.find((i) => i.productId === productId);
    if (!item) return;
    item.quantity--;
    if (item.quantity < 1) this.remove(productId);
  }
  remove(productId: string) {
    this.items = this.items.filter((i) => i.productId !== productId);
  }
  addClient() {
    const name = this.newClient.trim();
    void this.s
      .action(async () => {
        await this.s.saveListItem("clients", { name });
        this.clientId =
          (this.s.data().clients ?? []).find((c) => c.name === name)?.id ?? "";
      }, "Cliente incluído.")
      .then((ok) => ok && (this.newClient = ""));
  }
  edit(kit: any) {
    this.editingId = kit.id;
    this.clientId = kit.client_id;
    this.jobTitle = kit.job_title;
    // Kits antigos podem ter dois cadastros do mesmo C.A.: viram um item só, somando as unidades.
    this.items = [];
    for (const i of kit.items) {
      const item = this.itemOf(i.product_id);
      if (item) item.quantity += i.quantity;
      else this.items.push({ productId: i.product_id, quantity: i.quantity });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  reset() {
    this.editingId = "";
    this.clientId = "";
    this.jobTitle = "";
    this.items = [];
  }
  save() {
    void this.s
      .action(
        () => this.s.saveKit(this.clientId, this.jobTitle.trim(), this.items),
        "Kit salvo.",
      )
      .then((ok) => ok && this.reset());
  }
  removeKit(kit: any) {
    void this.s.action(() => this.s.deleteKit(kit.id), "Kit removido.");
  }
}
