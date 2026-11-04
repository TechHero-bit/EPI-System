import { z } from "zod";
import { isEquipmentSize } from "../../../contracts/equipment-sizes.mjs";
export const equipmentSizeSchema = z.string().refine(isEquipmentSize, {
  message: "Selecione um tamanho da lista: Único, letras ou números de 1 a 70.",
});
