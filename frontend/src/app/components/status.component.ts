import { Component, Input } from "@angular/core";
@Component({
  selector: "epi-status",
  standalone: true,
  template: `<span
    class="status"
    [class.ok]="
      value === 'CONFIRMED' ||
      value === 'DELIVERED' ||
      value.startsWith('SIGNED')
    "
    [class.danger]="value === 'CANCELLED'"
    >{{ labels[value] || value }}</span
  >`,
})
export class StatusComponent {
  @Input() value = "";
  labels: Record<string, string> = {
    PENDING: "Pendente",
    SIGNED_MANUAL: "Assinatura presencial",
    SIGNED_ELECTRONIC: "Assinatura eletrônica",
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
