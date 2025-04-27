import { useAccount } from "../../Account";
import { useCreditCard } from "../../CreditCard";
import { FinancialInstrument } from "../model/financial-instrument.types";

export function useFinancialInstruments() {
  const {
    accounts,
    isLoading: isLoadingAccounts,
    error: accountError,
  } = useAccount();
  const {
    creditCards,
    isLoading: isLoadingCreditCards,
    error: creditCardError,
  } = useCreditCard();

  const isLoading = isLoadingAccounts || isLoadingCreditCards;
  const error = accountError || creditCardError;

  const financialInstruments: FinancialInstrument[] = [
    ...accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      type: "ACCOUNT" as const,
    })),
    ...creditCards.map((cc) => ({
      id: cc.id,
      name: cc.name,
      type: "CREDIT_CARD" as const,
    })),
  ];

  return { financialInstruments, isLoading, error };
}
