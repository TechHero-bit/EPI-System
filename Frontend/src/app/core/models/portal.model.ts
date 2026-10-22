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
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
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
}
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
});
