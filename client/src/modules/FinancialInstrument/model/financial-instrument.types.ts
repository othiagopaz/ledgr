export type FinancialInstrumentType = "ACCOUNT" | "CREDIT_CARD";

export interface FinancialInstrument {
  id: string;
  name: string;
  type: FinancialInstrumentType;
}
