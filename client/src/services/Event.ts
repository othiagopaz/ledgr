// Removed unused import below
// import { FinancialInstrument } from "./api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// --- Actual Enums (Duplicated from server for now - TODO: Move to shared location) ---
export enum TransactionType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
}

export enum Ownership {
  OWN = "OWN",
  REFUNDABLE = "REFUNDABLE",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
  SCHEDULED = "SCHEDULED",
}

// --- Payload Interfaces (Using actual enums) ---

export interface TransactionPayload {
  amount: number; // In cents
  installmentNumber: number;
  dueDate: string; // YYYY-MM-DD
  competenceDate: string; // YYYY-MM-DD
  paymentDate?: string; // YYYY-MM-DD (optional)
  type: TransactionType; // Use enum
  status: TransactionStatus; // Use enum
  ownership: Ownership; // Use enum
  // Include ONE of the following based on the selected instrument
  accountId?: string;
  creditCardId?: string;
}

export interface CreateEventPayload {
  description: string;
  date: string; // YYYY-MM-DD (competence/due date for the event itself)
  categoryId: string;
  negotiatorId: string; // Fixed for now
  transactions: TransactionPayload[];
}

// --- API Response Interface (Example - Adjust as needed) ---
interface CreateEventResponse {
  success: boolean;
  message?: string;
  // Use unknown instead of any for better type safety
  data?: unknown;
}

// --- API Function ---

/**
 * Creates a new event (income/expense) via the API.
 * @param payload - The event data to create.
 * @returns The API response.
 */
export async function createEvent(
  payload: CreateEventPayload
): Promise<CreateEventResponse> {
  if (!API_BASE_URL) {
    console.error("VITE_API_BASE_URL não está definida no .env");
    throw new Error("Configuração de API ausente.");
  }

  try {
    const response = await fetch(`${API_BASE_URL}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add Authorization header if needed later
        // 'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData: CreateEventResponse = await response.json();

    if (!response.ok || !responseData.success) {
      throw new Error(
        responseData.message || `Erro ao criar evento: ${response.statusText}`
      );
    }

    return responseData;
  } catch (error) {
    console.error("Falha na requisição createEvent:", error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error("Ocorreu um erro desconhecido ao criar o evento.");
    }
  }
}
