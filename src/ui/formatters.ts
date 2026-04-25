const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdStandardFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatUsd(value: number, compact = false): string {
  if (!Number.isFinite(value)) {
    return "$0";
  }

  return compact
    ? usdCompactFormatter.format(value)
    : usdStandardFormatter.format(value);
}
