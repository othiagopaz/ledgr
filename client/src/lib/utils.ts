import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatPercentage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
  }).format(value);
}

export function formatCurrencyFromCents(value: number) {
  return formatCurrency(value / 100);
}
