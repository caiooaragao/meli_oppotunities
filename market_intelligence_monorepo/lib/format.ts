export function formatMoney(value: number | null | undefined, currency = "BRL") {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}
