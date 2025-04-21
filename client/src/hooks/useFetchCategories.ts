import { useState, useEffect } from "react";
import { getCategories, Category } from "@/services/Category";

/**
 * Custom hook to fetch categories from the API.
 * Manages loading and error states.
 * @returns An object containing the categories data, loading status, and error message.
 */
export function useFetchCategories() {
  const [data, setData] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Directly call getCategories which now handles the full response structure
        const categoriesData = await getCategories();
        setData(categoriesData); // Assuming getCategories returns Category[] on success
      } catch (err) {
        console.error("Error fetching categories:", err);
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
        setData([]); // Clear data on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []); // Empty dependency array means this effect runs once on mount

  return { data, isLoading, error };
}
