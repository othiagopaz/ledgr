import { useState, useEffect, useMemo, useCallback } from "react";
import { EventModel } from "../model/event.model";
import { flattenTransactions, TransactionRow } from "../model/event.types";
import { normalizeEvents } from "../model/event.mapper";
import { useAppContext } from "@/context/AppContext";

export function useEvent() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  // Memoize the date calculations
  const { firstDayOfMonth, lastDayOfMonth } = useMemo(() => {
    const first = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const last = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    );
    return {
      firstDayOfMonth: first,
      lastDayOfMonth: last,
    };
  }, []);

  const [from, setFrom] = useState<string>(
    firstDayOfMonth.toISOString().split("T")[0]
  );
  const [to, setTo] = useState<string>(
    lastDayOfMonth.toISOString().split("T")[0]
  );

  const { categories, financialInstruments } = useAppContext();

  // Memoize the dependencies to prevent unnecessary re-renders
  const memoizedCategories = useMemo(
    () => categories.categories,
    [categories.categories]
  );
  const memoizedFinancialInstruments = useMemo(
    () => financialInstruments.financialInstruments,
    [financialInstruments.financialInstruments]
  );

  // Memoize the EventModel instance
  const eventModel = useMemo(() => new EventModel(), []);

  // Memoize the fetch function
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await eventModel.fetchAll({ page, limit, from, to });
      const { events, total } = normalizeEvents(response);
      const flattened = flattenTransactions(
        events,
        memoizedCategories,
        memoizedFinancialInstruments
      );
      setTransactions(flattened);
      setTotalPages(Math.ceil(total / limit));
    } catch (err) {
      console.error(err);
      setError("Erro ao buscar eventos");
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    page,
    limit,
    from,
    to,
    memoizedFinancialInstruments,
    memoizedCategories,
    eventModel,
  ]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    transactions,
    isLoading,
    error,
    page,
    setPage,
    totalPages,
    from,
    setFrom,
    to,
    setTo,
  };
}
