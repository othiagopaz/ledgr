import { useEffect, useState } from "react";
import { AccountModel } from "../model/account.model";
import { Account } from "../model/account.types";
export function useAccount() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setIsLoading(true);
        const model = new AccountModel();
        const response = await model.fetchAll();
        setAccounts(response.data);
      } catch (err) {
        setError("Erro ao buscar contas " + err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  return {
    isLoading,
    error,
    accounts,
  };
}
