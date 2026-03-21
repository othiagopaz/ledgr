import { useAppStore } from "../stores/appStore";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseSmartDate(input: string): string {
  const lower = input.trim().toLowerCase();
  if (lower === "t" || lower === "today") return today();
  if (lower === "y" || lower === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  // Try DD/MM/YYYY or MM/DD/YYYY patterns
  const fullMatch = lower.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fullMatch) {
    const a = parseInt(fullMatch[1]);
    const b = parseInt(fullMatch[2]);
    const year = fullMatch[3];
    if (a > 12) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    const locale = useAppStore.getState().locale;
    const currency = useAppStore.getState().operatingCurrency;
    const isDayFirst =
      locale?.startsWith("pt") ||
      locale?.startsWith("de") ||
      locale?.startsWith("es") ||
      locale?.startsWith("fr") ||
      currency === "BRL" ||
      currency === "EUR";
    if (isDayFirst) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // Try partial date like "03/15" or "15/03"
  const slashMatch = lower.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1]);
    const b = parseInt(slashMatch[2]);
    const year = new Date().getFullYear();
    const locale = useAppStore.getState().locale;
    const currency = useAppStore.getState().operatingCurrency;
    const isDayFirst =
      locale?.startsWith("pt") ||
      locale?.startsWith("de") ||
      locale?.startsWith("es") ||
      locale?.startsWith("fr") ||
      currency === "BRL" ||
      currency === "EUR";
    if (isDayFirst) {
      return `${year}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    return `${year}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  }
  // If it looks like a valid ISO date already, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  return input;
}
