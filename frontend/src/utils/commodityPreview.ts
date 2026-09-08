/**
 * Commodity draft → `PostingInput[]` payload and Beancount preview text.
 *
 * Pure — no store, no I/O. The Composer's "Commodity" disclosure feeds a
 * `CommodityDraft` in here and gets back two things that are guaranteed to
 * agree: the postings it will POST and the Beancount text it shows the user.
 * The preview is *rendered from the postings* (`formatEntry`), never built in
 * parallel, so there is no second code path that could drift.
 *
 * The rules encoded here are PLAN-commodities-ux §2 (spend vs hold):
 *
 *   - An asset account **holds** iff it has a booking method. A hold buy stores
 *     the price as cost `{price OC}`; a hold sale carries `{cost} @ price` plus
 *     an elided gain leg — Beancount computes the gain as the residual.
 *   - A **spend** account (no booking) is held at price: `@ price` on both
 *     directions, no gain leg (the `currency_accounts` plugin owns that).
 *   - **Exchange** is cash-to-cash at price, whatever the target's booking.
 *   - Booking `NONE` (Brazilian average cost) writes the average cost
 *     explicitly; every other booking either names a lot or emits `{}`.
 */
import type { BookingMethod, HoldingLot, PostingInput } from "../types";

export type CommodityKind = "buy" | "sell" | "exchange";

/** Which lot a sale reduces, on an account whose booking keeps lots. */
export type LotChoice = { kind: "auto" } | { kind: "lot"; lot: HoldingLot };

export interface CommodityDraft {
  kind: CommodityKind;
  quantity: number | null;
  /** Commodity symbol — `PETR4`, `USD`, `XAU`. */
  commodity: string;
  /** Unit price, in the operating currency. */
  unitPrice: number | null;
  operatingCurrency: string;
  /** The money side. For an exchange, the account that pays. */
  cashAccount: string;
  /** The side that receives (buy/exchange) or gives up (sell) the commodity. */
  assetAccount: string;
  /** The asset account's booking method. `null` ⇒ a spend account (at price). */
  booking: BookingMethod | null;
  fees: number | null;
  feesAccount: string;
  /** Sale from a `NONE` account: the (editable) average cost per unit. */
  avgCost: number | null;
  /** Cost currency of the position being sold; defaults to the OC. */
  costCurrency?: string | null;
  /** Sale from a FIFO/LIFO/HIFO/STRICT account: which lot. */
  lot: LotChoice | null;
  /** Elided leg on a hold sale. */
  gainAccount: string;
}

export interface EntryHeader {
  date: string;
  flag: "*" | "!";
  payee: string;
  narration: string;
  tags: string[];
  links: string[];
}

/** Beancount's currency syntax: `[A-Z][A-Z0-9'._-]{0,22}[A-Z0-9]`, or a single letter. */
export const COMMODITY_RE = /^[A-Z]([A-Z0-9'._-]{0,22}[A-Z0-9])?$/;

// ── arithmetic ─────────────────────────────────────────────────────────────

/**
 * Locale-aware number for the commodity fields. Same convention as
 * `tryParseAmount` (`commaDecimal` ⇒ `1.234,56`; else `1,234.56`) but without
 * its 1–2 decimal-digit cap, since quantities can be `0.005 BTC`. When only
 * the *other* separator appears, exactly three trailing digits read as a
 * thousands group (`1.000` → 1000 under comma-decimal), anything else as a
 * decimal point (`0.005` → 0.005). Returns `null` for anything that is not a
 * positive number.
 */
export function parseLocaleNumber(raw: string, commaDecimal: boolean): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s || !/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let dec: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    dec = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep: "." | "," = lastDot >= 0 ? "." : ",";
    const localeDec = commaDecimal ? "," : ".";
    const [intPart, ...rest] = s.split(sep);
    if (sep === localeDec) dec = sep;
    else dec = rest.length === 1 && rest[0].length === 3 && intPart !== "0" && intPart !== "" ? null : sep;
  }
  let normalized: string;
  if (dec) {
    const thou = dec === "." ? "," : ".";
    if (s.split(dec).length !== 2) return null;               // two decimal points
    normalized = s.split(thou).join("").replace(dec, ".");
  } else {
    normalized = s.replace(/[.,]/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Round to cents without the usual float surprises (1.005 → 1.01). */
export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}

/** Does the asset side hold to sell (track cost)? Exchange never does. */
export function holdsAtCost(d: Pick<CommodityDraft, "kind" | "booking">): boolean {
  return d.kind !== "exchange" && d.booking != null;
}

/** Gross value of the trade (qty × price) in the OC, rounded to cents. */
export function grossValue(d: CommodityDraft): number | null {
  if (!d.quantity || !d.unitPrice) return null;
  return round2(d.quantity * d.unitPrice);
}

/** Cash that moves: −(gross + fees) on a buy/exchange, +(gross − fees) on a sale. */
export function cashAmount(d: CommodityDraft): number | null {
  const gross = grossValue(d);
  if (gross == null) return null;
  const fees = d.fees ?? 0;
  return d.kind === "sell" ? round2(gross - fees) : round2(-(gross + fees));
}

/**
 * Approximate realised gain on a hold sale: qty × (price − cost) − fees.
 * Only when the cost is known up front (NONE average, or a chosen lot);
 * an automatic `{}` sale leaves it to Beancount, so `null`.
 */
export function estimatedGain(d: CommodityDraft): number | null {
  if (d.kind !== "sell" || !holdsAtCost(d) || !d.quantity || !d.unitPrice) return null;
  let cost: number | null = null;
  if (d.booking === "NONE") cost = d.avgCost;
  else if (d.lot?.kind === "lot") cost = parseFloat(d.lot.lot.cost);
  if (cost == null || Number.isNaN(cost)) return null;
  return round2(d.quantity * (d.unitPrice - cost) - (d.fees ?? 0));
}

// ── payload ────────────────────────────────────────────────────────────────

/**
 * The postings to send. Empty until quantity, commodity and price are all in —
 * the preview reads that as "nothing to show yet". Validation is separate
 * (`validateCommodityDraft`) so the preview can render a half-filled draft.
 */
export function commodityPostings(d: CommodityDraft): PostingInput[] {
  const gross = grossValue(d);
  const cash = cashAmount(d);
  if (gross == null || cash == null || !d.commodity || !d.quantity) return [];
  const oc = d.operatingCurrency;
  const fees = d.fees ?? 0;
  const out: PostingInput[] = [];

  if (d.kind === "sell") {
    const asset: PostingInput = { account: d.assetAccount, amount: -d.quantity, currency: d.commodity };
    if (holdsAtCost(d)) {
      const costCur = d.costCurrency || oc;
      if (d.booking === "NONE") {
        if (d.avgCost != null) { asset.cost = d.avgCost; asset.cost_currency = costCur; }
      } else if (d.lot?.kind === "lot") {
        asset.cost = parseFloat(d.lot.lot.cost);
        asset.cost_currency = costCur;
        asset.cost_date = d.lot.lot.date;
        if (d.lot.lot.label) asset.cost_label = d.lot.lot.label;
      } else {
        asset.cost_empty = true;
      }
    }
    asset.price = d.unitPrice;
    asset.price_currency = oc;
    out.push(asset);
    out.push({ account: d.cashAccount, amount: cash, currency: oc });
    if (fees > 0) out.push({ account: d.feesAccount, amount: round2(fees), currency: oc });
    if (holdsAtCost(d)) out.push({ account: d.gainAccount, amount: null, currency: null });
    return out;
  }

  // buy / exchange
  const asset: PostingInput = { account: d.assetAccount, amount: d.quantity, currency: d.commodity };
  if (holdsAtCost(d)) {
    asset.cost = d.unitPrice;
    asset.cost_currency = oc;
  } else {
    asset.price = d.unitPrice;
    asset.price_currency = oc;
  }
  out.push(asset);
  out.push({ account: d.cashAccount, amount: cash, currency: oc });
  if (fees > 0) out.push({ account: d.feesAccount, amount: round2(fees), currency: oc });
  return out;
}

// ── preview ────────────────────────────────────────────────────────────────

/** Units of a commodity: integers bare, else up to 8 decimals with no trailing zeros. */
export function fmtUnits(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

/** Money in the operating currency — always two decimals. */
export function fmtMoney(n: number): string {
  return round2(n).toFixed(2);
}

/** A rate (cost or price): two decimals when that is exact, else up to six. */
export function fmtRate(n: number): string {
  if (Math.abs(round2(n) - n) < 1e-9) return round2(n).toFixed(2);
  return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function costSpec(p: PostingInput): string {
  if (p.cost_empty) return " {}";
  const parts: string[] = [];
  if (p.cost_total != null) parts.push(`${fmtRate(p.cost_total)} ${p.cost_currency ?? ""}`.trim());
  else if (p.cost != null) parts.push(`${fmtRate(p.cost)} ${p.cost_currency ?? ""}`.trim());
  if (p.cost_date) parts.push(p.cost_date);
  if (p.cost_label) parts.push(`"${p.cost_label}"`);
  if (parts.length === 0) return "";
  const body = parts.join(", ");
  return p.cost_total != null ? ` {{${body}}}` : ` {${body}}`;
}

function priceSpec(p: PostingInput): string {
  if (p.price == null) return "";
  return ` @ ${fmtRate(p.price)} ${p.price_currency ?? ""}`.replace(/\s+$/, "");
}

/**
 * Render an entry the way `printer.format_entry` lays it out: header line,
 * then each posting indented two spaces with accounts left-aligned and
 * numbers right-aligned in one column. An elided leg is just the account.
 */
export function formatEntry(h: EntryHeader, postings: PostingInput[], operatingCurrency: string): string {
  let head = `${h.date} ${h.flag}`;
  if (h.payee) head += ` "${h.payee}"`;
  head += ` "${h.narration}"`;
  for (const t of h.tags) head += ` #${t}`;
  for (const l of h.links) head += ` ^${l}`;

  const rows = postings.map((p) => {
    const num = p.amount == null ? ""
      : (p.currency === operatingCurrency ? fmtMoney(p.amount) : fmtUnits(p.amount));
    return { account: p.account || "…", num, tail: p.amount == null ? "" : ` ${p.currency ?? ""}${costSpec(p)}${priceSpec(p)}` };
  });
  const accW = Math.max(0, ...rows.map((r) => r.account.length));
  const numW = Math.max(0, ...rows.map((r) => r.num.length));
  const lines = rows.map((r) =>
    r.num
      ? `  ${r.account.padEnd(accW)}  ${r.num.padStart(numW)}${r.tail}`
      : `  ${r.account}`,
  );
  return [head, ...lines].join("\n");
}

/** Preview for the current draft — the postings we would send, rendered. */
export function commodityPreview(h: EntryHeader, d: CommodityDraft): string {
  return formatEntry(h, commodityPostings(d), d.operatingCurrency);
}

// ── narration ──────────────────────────────────────────────────────────────

/** "Buy 100 PETR4" / "Sell 50 PETR4" / "Buy 1000 USD" — empty until both parts exist. */
export function suggestNarration(d: Pick<CommodityDraft, "kind" | "quantity" | "commodity">): string {
  if (!d.quantity || !d.commodity) return "";
  const verb = d.kind === "sell" ? "Sell" : "Buy";
  return `${verb} ${fmtUnits(d.quantity)} ${d.commodity}`;
}

// ── validation ─────────────────────────────────────────────────────────────

/** First problem with the draft, or `null` when it is ready to post. */
export function validateCommodityDraft(d: CommodityDraft): string | null {
  if (!d.quantity || d.quantity <= 0 || !Number.isFinite(d.quantity)) return "Quantity must be a positive number.";
  if (!d.commodity.trim()) return "Pick a commodity.";
  if (!COMMODITY_RE.test(d.commodity)) return `"${d.commodity}" is not a valid commodity symbol (A–Z, digits, ' . _ -).`;
  if (d.commodity === d.operatingCurrency) return `The commodity must differ from the operating currency (${d.operatingCurrency}).`;
  if (!d.unitPrice || d.unitPrice <= 0 || !Number.isFinite(d.unitPrice)) return `Unit price in ${d.operatingCurrency} is required.`;
  if (!d.cashAccount.trim()) return "Pick the cash account.";
  if (!d.assetAccount.trim()) return d.kind === "exchange" ? "Pick the account that receives the currency." : "Pick the asset account.";
  if (d.cashAccount === d.assetAccount) return "Cash and asset accounts must differ.";
  if (d.fees != null && d.fees < 0) return "Fees cannot be negative.";
  if (d.fees && d.fees > 0 && !d.feesAccount.trim()) return "Pick an account for the fees.";
  if (d.kind === "sell" && holdsAtCost(d)) {
    if (!d.gainAccount.trim()) return "Pick the gain account.";
    if (d.booking === "NONE") {
      if (d.avgCost == null || d.avgCost <= 0) return "Cost basis (average) is required for an average-cost sale.";
    } else if (!d.lot) {
      return "Pick a lot, or Automatic.";
    } else if (d.lot.kind === "lot") {
      const units = parseFloat(d.lot.lot.units);
      if (Number.isFinite(units) && d.quantity > units + 1e-9)
        return `That lot holds ${fmtUnits(units)} ${d.commodity} — you cannot sell ${fmtUnits(d.quantity)} from it.`;
    }
  }
  return null;
}
