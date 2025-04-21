import { Category, ApiResponse } from "./category.types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function getCategories(): Promise<Category[]> {
  if (!API_BASE_URL) {
    console.error("VITE_API_BASE_URL não está definida no .env");
    throw new Error("Configuração de API ausente.");
  }

  try {
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
