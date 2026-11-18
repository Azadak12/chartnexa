/** Prices are whole US cents everywhere; dollars appear only on screen and in the staff form. */
export const MAX_PRICE_CENTS = 1_000_000;

const FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatPrice(cents: number): string {
  return cents === 0 ? "Free" : FORMATTER.format(cents / 100);
}

/** Cents back to the text a staff member edits: 4950 becomes "49.50". */
export function centsToDollarText(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

export type PriceParse = { ok: true; cents: number } | { ok: false; message: string };

/**
 * Parses what a person typed as dollars into whole cents without floating point. Accepts "49",
 * "49.5" and "49.50"; rejects more than two decimals, signs, letters and anything above $10,000.
 */
export function parseDollars(input: string): PriceParse {
  const text = input.trim();
  if (text === "") return { ok: false, message: "Enter a price, or 0 for a free course." };
  const m = /^(\d{1,5})(?:\.(\d{0,2}))?$/.exec(text);
  if (!m) {
    return /\.\d{3,}/.test(text)
      ? { ok: false, message: "Use at most two decimal places, for example 49.50." }
      : { ok: false, message: "Enter a price like 49 or 49.50." };
  }
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (cents > MAX_PRICE_CENTS) return { ok: false, message: "The highest price is $10,000.00." };
  return { ok: true, cents };
}
