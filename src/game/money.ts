const SYMBOLS: Record<string, string> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function currencySymbol(currency = 'ZAR'): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

export function formatMoney(amount: number, currency = 'ZAR'): string {
  const symbol = currencySymbol(currency);
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A multiplier as the game shows it: "2.47×". */
export function formatMultiplier(m: number): string {
  return `${m.toFixed(2)}×`;
}

/** Cents-exact product of a stake and a multiplier, floored like the server does. */
export function payout(stake: number, multiplier: number, maxWin = Infinity): number {
  return Math.min(maxWin, Math.floor(stake * multiplier * 100 + 1e-6) / 100);
}
