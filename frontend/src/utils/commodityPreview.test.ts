import { describe, it, expect } from "vitest";
import {
  commodityPostings, commodityPreview, formatEntry, estimatedGain, cashAmount,
  suggestNarration, validateCommodityDraft, round2, fmtUnits, fmtRate, parseLocaleNumber,
  type CommodityDraft, type EntryHeader,
} from "./commodityPreview";
import type { PostingInput } from "../types";

const header: EntryHeader = {
  date: "2026-06-01", flag: "*", payee: "", narration: "", tags: [], links: [],
};

/** A hold account (booking set) buying/selling PETR4 for BRL cash. */
function base(over: Partial<CommodityDraft> = {}): CommodityDraft {
  return {
    kind: "buy",
    quantity: 100,
    commodity: "PETR4",
    unitPrice: 33,
    operatingCurrency: "BRL",
    cashAccount: "Assets:Bank:Itau",
    assetAccount: "Assets:XP",
    booking: "NONE",
    fees: null,
    feesAccount: "Expenses:Fees",
    avgCost: null,
    lot: null,
    gainAccount: "Income:Gains",
    ...over,
  };
}

// The eight cases the coordinator cross-checks against the backend.
const CASES: Record<string, CommodityDraft> = {
  "buy at cost (hold, NONE)": base(),
  "buy at price (spend account)": base({
    commodity: "USD", quantity: 1000, unitPrice: 5, assetAccount: "Assets:Global", booking: null,
  }),
  "NONE sale — average cost, elided gain": base({
    kind: "sell", quantity: 50, unitPrice: 40, avgCost: 35,
  }),
  "FIFO sale — automatic {}": base({
    kind: "sell", quantity: 50, unitPrice: 40, booking: "FIFO", lot: { kind: "auto" },
  }),
  "FIFO sale — chosen lot (date + label)": base({
    kind: "sell", quantity: 50, unitPrice: 40, booking: "FIFO",
    lot: { kind: "lot", lot: { date: "2026-02-01", label: "lote-fev", units: "100", cost: "33.00" } },
  }),
  "exchange — cash to cash at price": base({
    kind: "exchange", commodity: "USD", quantity: 1000, unitPrice: 5.2,
    assetAccount: "Assets:Global", booking: "FIFO",   // booking is ignored on an exchange
  }),
  "buy with fees": base({ fees: 4.9 }),
  "sell from a spend account (no gain leg)": base({
    kind: "sell", commodity: "USD", quantity: 200, unitPrice: 5.5, assetAccount: "Assets:Global", booking: null,
  }),
};

describe("commodityPostings — payloads", () => {
  it("buy into a holding account stores the price as cost", () => {
    expect(commodityPostings(CASES["buy at cost (hold, NONE)"])).toEqual<PostingInput[]>([
      { account: "Assets:XP", amount: 100, currency: "PETR4", cost: 33, cost_currency: "BRL" },
      { account: "Assets:Bank:Itau", amount: -3300, currency: "BRL" },
    ]);
  });

  it("buy into a spend account is held at price, no cost", () => {
    expect(commodityPostings(CASES["buy at price (spend account)"])).toEqual<PostingInput[]>([
      { account: "Assets:Global", amount: 1000, currency: "USD", price: 5, price_currency: "BRL" },
      { account: "Assets:Bank:Itau", amount: -5000, currency: "BRL" },
    ]);
  });

  it("NONE sale writes the average cost and elides the gain leg", () => {
    const d = CASES["NONE sale — average cost, elided gain"];
    expect(commodityPostings(d)).toEqual<PostingInput[]>([
      { account: "Assets:XP", amount: -50, currency: "PETR4", cost: 35, cost_currency: "BRL", price: 40, price_currency: "BRL" },
      { account: "Assets:Bank:Itau", amount: 2000, currency: "BRL" },
      { account: "Income:Gains", amount: null, currency: null },
    ]);
    expect(estimatedGain(d)).toBe(250);
  });

  it("FIFO automatic sale emits {} and leaves the gain to Beancount", () => {
    const d = CASES["FIFO sale — automatic {}"];
    const [asset] = commodityPostings(d);
    expect(asset).toEqual({
      account: "Assets:XP", amount: -50, currency: "PETR4", cost_empty: true, price: 40, price_currency: "BRL",
    });
    expect(asset).not.toHaveProperty("cost");
    expect(asset).not.toHaveProperty("cost_date");
    expect(estimatedGain(d)).toBeNull();
  });

  it("FIFO chosen lot names cost, date and label", () => {
    const d = CASES["FIFO sale — chosen lot (date + label)"];
    expect(commodityPostings(d)).toEqual<PostingInput[]>([
      {
        account: "Assets:XP", amount: -50, currency: "PETR4",
        cost: 33, cost_currency: "BRL", cost_date: "2026-02-01", cost_label: "lote-fev",
        price: 40, price_currency: "BRL",
      },
      { account: "Assets:Bank:Itau", amount: 2000, currency: "BRL" },
      { account: "Income:Gains", amount: null, currency: null },
    ]);
    expect(estimatedGain(d)).toBe(350);
  });

  it("exchange is cash-to-cash at price, ignoring the target's booking", () => {
    expect(commodityPostings(CASES["exchange — cash to cash at price"])).toEqual<PostingInput[]>([
      { account: "Assets:Global", amount: 1000, currency: "USD", price: 5.2, price_currency: "BRL" },
      { account: "Assets:Bank:Itau", amount: -5200, currency: "BRL" },
    ]);
  });

  it("fees add a third leg and come out of the cash side", () => {
    expect(commodityPostings(CASES["buy with fees"])).toEqual<PostingInput[]>([
      { account: "Assets:XP", amount: 100, currency: "PETR4", cost: 33, cost_currency: "BRL" },
      { account: "Assets:Bank:Itau", amount: -3304.9, currency: "BRL" },
      { account: "Expenses:Fees", amount: 4.9, currency: "BRL" },
    ]);
    const sale = base({ kind: "sell", quantity: 50, unitPrice: 40, avgCost: 35, fees: 4.9 });
    expect(cashAmount(sale)).toBe(1995.1);
    expect(commodityPostings(sale)[2]).toEqual({ account: "Expenses:Fees", amount: 4.9, currency: "BRL" });
    expect(estimatedGain(sale)).toBe(245.1);
  });

  it("sale from a spend account is at price with no gain leg", () => {
    const ps = commodityPostings(CASES["sell from a spend account (no gain leg)"]);
    expect(ps).toEqual<PostingInput[]>([
      { account: "Assets:Global", amount: -200, currency: "USD", price: 5.5, price_currency: "BRL" },
      { account: "Assets:Bank:Itau", amount: 1100, currency: "BRL" },
    ]);
    expect(ps.some((p) => p.account === "Income:Gains")).toBe(false);
  });

  it("is empty until quantity, commodity and price are all in", () => {
    expect(commodityPostings(base({ quantity: null }))).toEqual([]);
    expect(commodityPostings(base({ unitPrice: null }))).toEqual([]);
    expect(commodityPostings(base({ commodity: "" }))).toEqual([]);
  });

  it("a lot-less sale on a lot-keeping account without a choice falls back to {}", () => {
    const [asset] = commodityPostings(base({ kind: "sell", quantity: 1, unitPrice: 1, booking: "HIFO", lot: null }));
    expect(asset.cost_empty).toBe(true);
  });
});

describe("commodityPreview — Beancount text", () => {
  it("lays out a NONE sale like printer.format_entry", () => {
    const d = CASES["NONE sale — average cost, elided gain"];
    const text = commodityPreview({ ...header, narration: "Sell 50 PETR4" }, d);
    expect(text).toBe([
      '2026-06-01 * "Sell 50 PETR4"',
      "  Assets:XP             -50 PETR4 {35.00 BRL} @ 40.00 BRL",
      "  Assets:Bank:Itau  2000.00 BRL",
      "  Income:Gains",
    ].join("\n"));
  });

  it("renders {} for an automatic sale and the lot identifiers for a chosen one", () => {
    expect(commodityPreview(header, CASES["FIFO sale — automatic {}"]))
      .toContain("-50 PETR4 {} @ 40.00 BRL");
    expect(commodityPreview(header, CASES["FIFO sale — chosen lot (date + label)"]))
      .toContain('-50 PETR4 {33.00 BRL, 2026-02-01, "lote-fev"} @ 40.00 BRL');
  });

  it("renders a price-only leg with @ and no braces", () => {
    const text = commodityPreview(header, CASES["exchange — cash to cash at price"]);
    expect(text).toContain("1000 USD @ 5.20 BRL");
    expect(text).not.toContain("{");
  });

  it("puts payee, tags and links on the header line", () => {
    const text = commodityPreview(
      { ...header, flag: "!", payee: "XP", narration: "Buy 100 PETR4", tags: ["invest"], links: ["ord-1"] },
      CASES["buy at cost (hold, NONE)"],
    );
    expect(text.split("\n")[0]).toBe('2026-06-01 ! "XP" "Buy 100 PETR4" #invest ^ord-1');
  });

  it("renders a total cost as {{…}}", () => {
    const text = formatEntry(header, [
      { account: "Assets:XP", amount: 100, currency: "PETR4", cost_total: 3300, cost_currency: "BRL" },
      { account: "Assets:Bank:Itau", amount: -3300, currency: "BRL" },
    ], "BRL");
    expect(text).toContain("100 PETR4 {{3300.00 BRL}}");
  });

  it("payload and preview agree on every number, for every case", () => {
    for (const [name, d] of Object.entries(CASES)) {
      const postings = commodityPostings(d);
      const lines = commodityPreview(header, d).split("\n");
      expect(lines, name).toHaveLength(postings.length + 1);
      postings.forEach((p, i) => {
        const line = lines[i + 1];
        expect(line, `${name}: account`).toContain(p.account);
        if (p.amount == null) {
          expect(line.trim(), `${name}: elided leg`).toBe(p.account);
          return;
        }
        const numStr = p.currency === d.operatingCurrency ? round2(p.amount).toFixed(2) : fmtUnits(p.amount);
        expect(line, `${name}: amount`).toContain(`${numStr} ${p.currency}`);
        if (p.cost != null) expect(line, `${name}: cost`).toContain(`{${fmtRate(p.cost)} ${p.cost_currency}`);
        if (p.cost_empty) expect(line, `${name}: {}`).toContain(" {}");
        if (p.cost_date) expect(line, `${name}: lot date`).toContain(p.cost_date);
        if (p.cost_label) expect(line, `${name}: lot label`).toContain(`"${p.cost_label}"`);
        if (p.price != null) expect(line, `${name}: price`).toContain(`@ ${fmtRate(p.price)} ${p.price_currency}`);
        else expect(line, `${name}: no price`).not.toContain("@");
      });
    }
  });
});

describe("narration, validation, arithmetic", () => {
  it("suggests a narration from kind, quantity and commodity", () => {
    expect(suggestNarration({ kind: "buy", quantity: 100, commodity: "PETR4" })).toBe("Buy 100 PETR4");
    expect(suggestNarration({ kind: "sell", quantity: 50, commodity: "PETR4" })).toBe("Sell 50 PETR4");
    expect(suggestNarration({ kind: "exchange", quantity: 1000, commodity: "USD" })).toBe("Buy 1000 USD");
    expect(suggestNarration({ kind: "buy", quantity: 0.005, commodity: "BTC" })).toBe("Buy 0.005 BTC");
    expect(suggestNarration({ kind: "buy", quantity: null, commodity: "BTC" })).toBe("");
  });

  it("validates the essentials", () => {
    expect(validateCommodityDraft(base())).toBeNull();
    expect(validateCommodityDraft(base({ quantity: 0 }))).toMatch(/Quantity/);
    expect(validateCommodityDraft(base({ commodity: "petr4" }))).toMatch(/not a valid commodity/);
    expect(validateCommodityDraft(base({ commodity: "BRL" }))).toMatch(/operating currency/);
    expect(validateCommodityDraft(base({ unitPrice: null }))).toMatch(/Unit price/);
    expect(validateCommodityDraft(base({ cashAccount: "" }))).toMatch(/cash account/);
    expect(validateCommodityDraft(base({ assetAccount: "Assets:Bank:Itau" }))).toMatch(/must differ/);
    expect(validateCommodityDraft(base({ fees: 5, feesAccount: "" }))).toMatch(/fees/);
  });

  it("validates hold sales: cost basis, lot choice, lot size", () => {
    expect(validateCommodityDraft(base({ kind: "sell", unitPrice: 40, avgCost: null }))).toMatch(/Cost basis/);
    expect(validateCommodityDraft(base({ kind: "sell", unitPrice: 40, avgCost: 35, gainAccount: "" }))).toMatch(/gain account/);
    expect(validateCommodityDraft(base({ kind: "sell", unitPrice: 40, booking: "FIFO", lot: null }))).toMatch(/Pick a lot/);
    const big = base({
      kind: "sell", quantity: 150, unitPrice: 40, booking: "FIFO",
      lot: { kind: "lot", lot: { date: "2026-02-01", label: null, units: "100", cost: "33.00" } },
    });
    expect(validateCommodityDraft(big)).toMatch(/holds 100 PETR4/);
    expect(validateCommodityDraft({ ...big, quantity: 100 })).toBeNull();
    // A spend-account sale needs none of that.
    expect(validateCommodityDraft(base({ kind: "sell", unitPrice: 40, booking: null, gainAccount: "" }))).toBeNull();
  });

  it("parses locale numbers, including sub-cent quantities", () => {
    // comma-decimal (pt-BR)
    expect(parseLocaleNumber("1.234,56", true)).toBe(1234.56);
    expect(parseLocaleNumber("33,5", true)).toBe(33.5);
    expect(parseLocaleNumber("1.000", true)).toBe(1000);     // thousands group
    expect(parseLocaleNumber("0.005", true)).toBe(0.005);    // a lone 0. is never a group
    expect(parseLocaleNumber("0,005", true)).toBe(0.005);
    expect(parseLocaleNumber("33.5", true)).toBe(33.5);      // wrong separator, not a group
    // dot-decimal (en)
    expect(parseLocaleNumber("1,234.56", false)).toBe(1234.56);
    expect(parseLocaleNumber("0.005", false)).toBe(0.005);
    expect(parseLocaleNumber("1,000", false)).toBe(1000);
    expect(parseLocaleNumber("100", false)).toBe(100);
    // junk
    expect(parseLocaleNumber("", true)).toBeNull();
    expect(parseLocaleNumber("0", true)).toBeNull();
    expect(parseLocaleNumber("abc", true)).toBeNull();
    expect(parseLocaleNumber("1,2,3", true)).toBeNull();
  });

  it("rounds to cents without float drift", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(3 * 33.3)).toBe(99.9);
    expect(cashAmount(base({ quantity: 3, unitPrice: 33.33 }))).toBe(-99.99);
    expect(fmtRate(33.333333)).toBe("33.333333");
    expect(fmtRate(5.2)).toBe("5.20");
  });
});
