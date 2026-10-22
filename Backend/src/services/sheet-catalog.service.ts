import type { SheetItem } from "./document.service.js";

export function catalogSnapshotItem(
  product: {
    description: string;
    ca: string | null;
    brand: string;
    risk_code?: string | null;
  },
  variant: { id: string; size: string },
  deliveryDate: string,
): SheetItem {
  return {
    date: deliveryDate,
    description: product.description,
    ca: product.ca ?? "",
    brand: product.brand,
    risk: product.risk_code ?? "",
    size: variant.size,
    variantId: variant.id,
    quantity: 1,
  };
}
