import { useState, useEffect } from "react";
// import { getAccounts, Account } from "@/services/Account"; // Account type unused
import { getAccounts } from "@/services/Account";
// import { getCreditCards, CreditCard } from "@/services/CreditCard"; // CreditCard type unused
import { getCreditCards } from "@/services/CreditCard";
import { FinancialInstrument } from "@/services/api"; // Assuming FinancialInstrument is exported from api.ts
import {
  mapAccountToFinancialInstrument,
  mapCreditCardToFinancialInstrument,
} from "@/utils/mappers";

/**
 * Custom hook to fetch both accounts and credit cards,
 * map them to a unified FinancialInstrument type, and combine them.
 * Manages loading and error states.
 * @returns An object containing the combined financial instruments data, loading status, and error message.
 */
export function useFetchFinancialInstruments() {
  const [data, setData] = useState<FinancialInstrument[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInstruments = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch both accounts and credit cards in parallel
        const [accountsData, creditCardsData] = await Promise.all([
          getAccounts(),
          getCreditCards(),
        ]);

        // Map accounts to FinancialInstrument
        const mappedAccounts = accountsData.map(
          mapAccountToFinancialInstrument
        );

        // Map credit cards to FinancialInstrument
        const mappedCreditCards = creditCardsData.map(
          mapCreditCardToFinancialInstrument
        );

        // Combine mapped data
        const combinedInstruments = [...mappedAccounts, ...mappedCreditCards];

        // Sort instruments alphabetically by name (optional, but often useful)
        combinedInstruments.sort((a, b) => a.name.localeCompare(b.name));

        setData(combinedInstruments);
      } catch (err) {
        console.error("Error fetching financial instruments:", err);
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
        setData([]); // Clear data on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchInstruments();
  }, []); // Empty dependency array means this effect runs once on mount

  return { data, isLoading, error };
}
