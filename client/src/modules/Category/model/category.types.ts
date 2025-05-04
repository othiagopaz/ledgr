// Enum para o tipo de transação associada à categoria
export enum TransactionType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  isDefault: boolean;
  isArchived: boolean;
  userId: string | null;
  subcategories: Category[];
}

export interface CategoryApiResponse {
  success: boolean;
  data: Category[];
  message: string;
}

export interface CategorySelectOption {
  id: string;
  name: string;
  type: TransactionType;
}

export interface CategoryGroup {
  id: string;
  label: string;
  type: TransactionType;
  options: CategorySelectOption[];
}
