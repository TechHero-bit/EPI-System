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
  lotId: string;
  quantity: 1;
  risk: string;
  deliveryDate?: string;
  description?: string;
  ca?: string;
  brand?: string;
}
export interface PortalData {
  organization: { id: string; name: string };
  role: Role;
  employees: any[];
  products: any[];
  variants: any[];
  lots: any[];
  sheets: any[];
  states: any[];
  movements: any[];
  audits: any[];
  members?: any[];
  lastRecordNumber?: number;
}
export const emptyData = (): PortalData => ({
  organization: { id: "", name: "" },
  role: "ADMIN",
  employees: [],
  products: [],
  variants: [],
  lots: [],
  sheets: [],
  states: [],
  movements: [],
  audits: [],
});
