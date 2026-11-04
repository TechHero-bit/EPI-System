// Canonical sizes for new catalog entries. Keep migration 009 in sync.
export const LETTER_SIZES = [
  "PP",
  "P",
  "M",
  "G",
  "GG",
  "XG",
  "XGG",
  "XXG",
  "XXXG",
] as const;
export const NUMBER_SIZES = Array.from({ length: 70 }, (_, i) => String(i + 1));
export const SIZE_GROUPS = [
  { label: "Tamanho único", sizes: ["Único"] },
  { label: "Letras", sizes: [...LETTER_SIZES] },
  { label: "Números", sizes: NUMBER_SIZES },
] as const;
const allowed = new Set<string>(
  SIZE_GROUPS.flatMap((group) => [...group.sizes]),
);
export const isEquipmentSize = (value: unknown): value is string =>
  typeof value === "string" && allowed.has(value);
export const sizeGroupsFor = (sizes: Iterable<string>) => {
  const present = new Set(sizes);
  return SIZE_GROUPS.map((group) => ({
    ...group,
    sizes: group.sizes.filter((size) => present.has(size)),
  })).filter((group) => group.sizes.length);
};
