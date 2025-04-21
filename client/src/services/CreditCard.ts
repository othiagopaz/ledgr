// src/services/CreditCard.ts

// Reuse API_BASE_URL or define it again if needed
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Define a interface para os dados do cartão de crédito recebidos da API
export interface CreditCard {
  id: string;
  name: string;
  estimatedDaysBeforeDue: number;
  dueDay: number;
  flag: string; // e.g., "MASTERCARD", "VISA"
  isArchived: boolean;
  limit: {
    value: number;
  };
  institution: string | null;
  userId: string;
}

// Estrutura esperada da resposta da API (Similar to Account.ts)
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Função para buscar os cartões de crédito
export async function getCreditCards(): Promise<CreditCard[]> {
  if (!API_BASE_URL) {
    console.error("VITE_API_BASE_URL não está definida no .env");
    throw new Error("Configuração de API ausente.");
  }

  try {
    const response = await fetch(`${API_BASE_URL}/credit-cards`); // Assuming this endpoint

    if (!response.ok) {
      throw new Error(
        `Erro ao buscar cartões de crédito: ${response.statusText} (${response.status})`
      );
    }

    const result: ApiResponse<CreditCard[]> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(
        result.message ||
          "Erro ao buscar cartões de crédito: formato de resposta inesperado."
      );
    }

    return result.data;
  } catch (error) {
    console.error("Falha na requisição getCreditCards:", error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(
        "Ocorreu um erro desconhecido ao buscar cartões de crédito."
      );
    }
  }
}
