import { useEffect, useState } from "react";
import { CreditCardModel } from "../model/credit-card.model";
import { CreditCard } from "../model/credit-card.types";
export function useCreditCard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);

  useEffect(() => {
    const fetchCreditCards = async () => {
      try {
        setIsLoading(true);
        const model = new CreditCardModel();
        const response = await model.fetchAll();
        setCreditCards(response.data);
      } catch (err) {
        setError("Erro ao buscar contas " + err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCreditCards();
  }, []);

  return {
    isLoading,
    error,
    creditCards,
  };
}
