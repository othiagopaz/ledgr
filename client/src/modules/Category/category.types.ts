export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string | null;
  isDefault: boolean;
  isArchived: boolean;
  userId: string | null;
  parentCategoryId: string | null;
  subcategories: Category[];
}

export interface CategorySelectItem {
  id: string;
  name: string;
  isGroup: false;
}

export interface CategoryGroup {
  label: string;
  options: CategorySelectItem[];
  isGroup: true;
}

export type CategorySelectOption = CategoryGroup | CategorySelectItem;
