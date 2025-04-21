// src/services/Account.ts

// Obtém a URL base da API a partir das variáveis de ambiente (Vite) - Pode ser movido para um config compartilhado depois
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Define a interface para os dados da conta recebidos da API
export interface Account {
  id: string;
  name: string;
  type: "CHECKING" | "SAVINGS" | "CREDIT_CARD" | string; // Adjust based on actual possible API values
  initialBalance: {
    value: number;
  };
  isDefault: boolean;
  institution: string | null;
  color: string | null;
  isArchived: boolean;
  userId: string | null;
}

// Estrutura esperada da resposta da API (Genérica, pode ser movida depois se usada por mais entidades)
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string; // Optional message field
}

// Função para buscar as contas
export async function getAccounts(): Promise<Account[]> {
  if (!API_BASE_URL) {
    console.error("VITE_API_BASE_URL não está definida no .env");
    throw new Error("Configuração de API ausente.");
  }

  try {
    const response = await fetch(`${API_BASE_URL}/accounts`);

    if (!response.ok) {
      // Lança um erro se a resposta não for bem-sucedida (ex: 404, 500)
      throw new Error(
        `Erro ao buscar contas: ${response.statusText} (${response.status})`
      );
    }

    // Parseia a resposta completa
    const result: ApiResponse<Account[]> = await response.json();

    // Verifica se a operação na API foi bem-sucedida e se os dados existem
    if (!result.success || !result.data) {
      throw new Error(
        result.message ||
          "Erro ao buscar contas: formato de resposta inesperado."
      );
    }

    // Retorna apenas o array de contas dentro do campo 'data'
    return result.data;
  } catch (error) {
    console.error("Falha na requisição getAccounts:", error);
    // Relança o erro para que o componente que chamou possa tratá-lo
    if (error instanceof Error) {
      throw error; // Relança o erro original se for uma instância de Error
    } else {
      throw new Error("Ocorreu um erro desconhecido ao buscar contas.");
    }
  }
}
