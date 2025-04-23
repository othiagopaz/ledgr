// Enum para o tipo de transação associada à categoria
export enum TransactionType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
}

// Interface da categoria principal e suas subcategorias (recursiva)
export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  isDefault: boolean;
  isArchived: boolean;
  userId: string | null;
  subcategories: Category[]; // recursivo
}

// Estrutura da resposta da API
export interface CategoryApiResponse {
  success: boolean;
  data: Category[];
  message: string;
}

// Tipo auxiliar para exibir no select com grupos
export interface CategorySelectOption {
  id: string;
  name: string;
  isGroup?: boolean;
  type: TransactionType;
}

export interface CategoryGroup {
  label: string;
  options: CategorySelectOption[];
}
