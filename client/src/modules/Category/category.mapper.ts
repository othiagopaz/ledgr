import { CategorySelectOption } from "./category.types";
import { Category } from "./category.types";

export function mapCategoriesToSelectOptions(
  categories: Category[]
): CategorySelectOption[] {
  const options: CategorySelectOption[] = [];

  categories.forEach((category) => {
    if (category.subcategories && category.subcategories.length > 0) {
      options.push({
        label: category.name,
        isGroup: true,
        options: category.subcategories.map((sub) => ({
          id: sub.id,
          name: sub.name,
          isGroup: false,
        })),
      });
    }
  });

  return options;
}
