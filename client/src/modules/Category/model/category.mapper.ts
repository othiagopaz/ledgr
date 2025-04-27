import { CategoryGroup, Category } from "./category.types";

export function mapToHierarchicalCategories(
  categories: Category[]
): CategoryGroup[] {
  return categories.map((cat) => ({
    id: cat.id,
    label: cat.name,
    options: cat.subcategories.map((sub) => ({
      id: sub.id,
      name: `${cat.name} > ${sub.name}`,
      type: sub.type,
    })),
  }));
}
