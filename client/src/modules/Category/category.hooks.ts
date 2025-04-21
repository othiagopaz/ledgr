import { useState, useEffect } from "react";
import { getCategories } from "./category.api";
import { Category } from "./category.types";

export function useFetchCategories() {
  const [data, setData] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const categoriesData = await getCategories();
        setData(categoriesData);
      } catch (err) {
        console.error("Error fetching categories:", err);
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return { data, isLoading, error };
}
