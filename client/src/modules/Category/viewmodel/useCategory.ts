  import { useEffect, useState } from "react";
  import { CategoryModel } from "../model/category.model";
  import { CategoryGroup } from "../model/category.types";
  import { mapToHierarchicalCategories } from "../model/category.mapper";
  export function useCategory() {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hierarchicalCategories, setHierarchicalCategories] = useState<
      CategoryGroup[]
    >([]);
    useEffect(() => {
      const fetchCategories = async () => {
        try {
          setIsLoading(true);
          const model = new CategoryModel();
          const response = await model.fetchAll();
          setHierarchicalCategories(mapToHierarchicalCategories(response.data));
        } catch (err) {
          setError("Erro ao buscar categorias " + err);
        } finally {
          setIsLoading(false);
        }
      };

      fetchCategories();
    }, []);

    return {
      isLoading,
      error,
      hierarchicalCategories,
    };
  }
