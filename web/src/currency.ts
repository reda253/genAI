export type Currency = 'EUR' | 'MAD';

export const FX_RATE_EUR_MAD = 10.82; // Zetaris fx_rates view rate

export function formatCurrency(amountEur: number, currency: Currency = 'EUR'): string {
  if (currency === 'MAD') {
    const amountMad = amountEur * FX_RATE_EUR_MAD;
    return `${amountMad.toLocaleString('fr-MA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} MAD`;
  }
  return `€${amountEur.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
