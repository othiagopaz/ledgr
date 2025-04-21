const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Estrutura da resposta da API (pode ser movida para um tipo genérico global)
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Define a interface recursiva para Categoria
export interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE"; // Ou outros tipos se houver
  color: string | null;
  isDefault: boolean;
  isArchived: boolean;
  userId: string | null;
  parentCategoryId: string | null;
  subcategories: Category[]; // Campo recursivo
}

// Função para buscar as categorias
export async function getCategories(): Promise<Category[]> {
  if (!API_BASE_URL) {
    console.error("VITE_API_BASE_URL não está definida no .env");
    throw new Error("Configuração de API ausente.");
  }

  try {
    // Assumindo o endpoint /categories
    const response = await fetch(`${API_BASE_URL}/categories`);

    if (!response.ok) {
      throw new Error(
        `Erro ao buscar categorias: ${response.statusText} (${response.status})`
      );
    }

    const result: ApiResponse<Category[]> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(
        result.message ||
          "Erro ao buscar categorias: formato de resposta inesperado."
      );
    }

    return result.data;
  } catch (error) {
    console.error("Falha na requisição getCategories:", error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Ocorreu um erro desconhecido ao buscar categorias.");
    }
  }
}
