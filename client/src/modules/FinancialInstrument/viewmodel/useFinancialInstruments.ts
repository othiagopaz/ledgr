import { useAccount } from "../../Account";
import { useCreditCard } from "../../CreditCard";
import { useMemo } from "react";

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

  const financialInstruments = useMemo(() => {
    if (!creditCards && !accounts) {
      return [];
    }

    return [
      ...accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        type: "ACCOUNT" as const,
        helper: acc.institution || "",
        isDefault: acc.isDefault,
      })),
      ...creditCards.map((cc) => ({
        id: cc.id,
        name: cc.name,
        type: "CREDIT_CARD" as const,
        helper: cc.flag || "",
        isDefault: false, // TODO: Add isDefault to credit card on backend
      })),
    ];
  }, [accounts, creditCards]);

  return { financialInstruments, isLoading, error };
}
