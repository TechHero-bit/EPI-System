const collator = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});
export const compareLabels = (left: string, right: string) =>
  collator.compare(left, right);
export function alphabetical<T>(
  values: readonly T[],
  label: (value: T) => string,
): T[] {
  return [...values].sort((a, b) => compareLabels(label(a), label(b)));
}
