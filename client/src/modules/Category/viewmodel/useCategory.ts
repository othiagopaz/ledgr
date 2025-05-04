import { useEffect, useState, useMemo } from "react";
import { CategoryModel } from "../model/category.model";
import { Category } from "../model/category.types";

export function useCategory() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setIsLoading(true);
        const model = new CategoryModel();
        const response = await model.fetchAll();
        setCategories(response.data);
      } catch (err) {
        setError("Erro ao buscar categorias " + err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

  const returnValue = useMemo(
    () => ({
      isLoading,
      error,
      categories,
    }),
    [isLoading, error, categories]
  );

  return returnValue;
}
