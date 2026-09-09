export function parsePriceCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:[,.]\d{1,2})?$/.test(normalized)) return null;
  const [whole = '', fraction = ''] = normalized.split(/[,.]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 100_000_000 ? cents : null;
}

export function formatPriceInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
