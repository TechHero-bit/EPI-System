export type Role = "ADMIN" | "ALMOXARIFADO" | "RH" | "SEGURANCA_TRABALHO";
export const HR: Role[] = ["ADMIN", "RH", "SEGURANCA_TRABALHO"];
export const STOCK: Role[] = ["ADMIN", "ALMOXARIFADO"];
export const roles: Role[] = [
  "ADMIN",
  "ALMOXARIFADO",
  "RH",
  "SEGURANCA_TRABALHO",
];
export const roleNames: Record<Role, string> = {
  ADMIN: "Administração",
  ALMOXARIFADO: "Almoxarifado",
  RH: "Recursos Humanos",
  SEGURANCA_TRABALHO: "Segurança do Trabalho",
};
export const categories = [
  "Botas de segurança",
  "Capacetes de proteção",
  "Luvas de proteção",
  "Cintos de segurança",
];
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});
export const today = () => dateFormatter.format(new Date());
export interface DraftItem {
  variantId: string;
  quantity: 1;
  deliveryDate?: string;
}
export interface PortalData {
  organization: { id: string; name: string };
  role: Role;
  employees: any[];
  products: any[];
  variants: any[];
  inventory: any[];
  sheets: any[];
  states: any[];
  movements: any[];
  audits: any[];
  signingLinks?: any[];
  members?: any[];
  clients?: any[];
  workUnits?: any[];
  racs?: any[];
  employeeRacs?: { employee_id: string; rac_id: string }[];
  kits?: any[];
  kitItems?: { kit_id: string; product_id: string; quantity: number }[];
  returns?: any[];
}
export const LIST_KINDS = {
  clients: { key: "clients", label: "Clientes", singular: "cliente" },
  "work-units": { key: "workUnits", label: "Unidades de trabalho", singular: "unidade" },
  racs: { key: "racs", label: "RACs", singular: "RAC" },
} as const;
export type ListKind = keyof typeof LIST_KINDS;
/** Normalização usada para casar a função do colaborador com o kit. */
export const normalizeJobTitle = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
export const emptyData = (): PortalData => ({
  organization: { id: "", name: "" },
  role: "ADMIN",
  employees: [],
  products: [],
  variants: [],
  inventory: [],
  sheets: [],
  states: [],
  movements: [],
  audits: [],
  clients: [],
  workUnits: [],
  racs: [],
  employeeRacs: [],
  kits: [],
  kitItems: [],
  returns: [],
});
