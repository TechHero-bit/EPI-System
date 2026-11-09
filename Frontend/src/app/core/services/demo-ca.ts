// Conjunto FICTÍCIO de C.A. para a demonstração. Não corresponde à base CAEPI real
// e nunca é consultado pela rede. Números iniciados em 99 identificam a simulação.
export const DEMO_CA_REGISTRY = [
  {
    ca_number: "9900101",
    expires_at: "2029-06-30",
    status: "VÁLIDO",
    equipment_name: "CALÇADO OCUPACIONAL TIPO BOTINA",
    equipment_description: "Botina de segurança fictícia com biqueira, uso demonstrativo.",
    manufacturer: "Fabricante Fictício de EPI Ltda.",
    brand: "Marca Demo",
  },
  {
    ca_number: "9900202",
    expires_at: "2028-03-15",
    status: "VÁLIDO",
    equipment_name: "LUVA PARA PROTEÇÃO CONTRA AGENTES MECÂNICOS",
    equipment_description: "Luva fictícia em vaqueta, uso demonstrativo.",
    manufacturer: "Fabricante Fictício de EPI Ltda.",
    brand: "Marca Demo",
  },
  {
    ca_number: "9900303",
    expires_at: "2027-01-31",
    status: "VÁLIDO",
    equipment_name: "PROTETOR AUDITIVO TIPO INSERÇÃO",
    equipment_description: "Protetor auditivo fictício de silicone, uso demonstrativo.",
    manufacturer: "Indústria Demonstrativa S.A.",
    brand: "Audio Demo",
  },
  {
    ca_number: "9900404",
    expires_at: "2024-05-10",
    status: "VENCIDO",
    equipment_name: "ÓCULOS DE PROTEÇÃO",
    equipment_description: "Óculos fictício com lente incolor, uso demonstrativo.",
    manufacturer: "Indústria Demonstrativa S.A.",
    brand: "Visão Demo",
  },
] as const;
