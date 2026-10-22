import { Component, Input } from "@angular/core";
@Component({
  selector: "epi-status",
  standalone: true,
  templateUrl: "./status-badge.component.html",
})
export class StatusComponent {
  @Input() value = "";
  labels: Record<string, string> = {
    PENDING: "Pendente",
    SIGNED_MANUAL: "Assinada presencialmente",
    SIGNED_ELECTRONIC: "Assinada eletronicamente",
    UNCONFIRMED: "Entrega pendente",
    CONFIRMED: "Entrega confirmada",
    RESERVED: "Reservado",
    DELIVERED: "Entregue",
    CANCELLED: "Cancelado",
    RECEIPT: "Entrada",
    ISSUE: "Saída",
    ADJUSTMENT: "Ajuste",
  };
}
