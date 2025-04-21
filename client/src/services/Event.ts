import { Category } from "./Category"; // Add import for Category

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

// Matches the structure within the event's transactions array from API (getEvents)
// Note: This might slightly differ from CreateEventPayload's TransactionPayload
// We might need to refine/merge these later if the structures diverge significantly.
export interface TransactionPayload {
  id: string;
  eventId: string;
  amount: number; // In cents
  dueDate: string; // YYYY-MM-DD
  installmentNumber: number;
  competenceDate: string; // YYYY-MM-DD
  status: TransactionStatus; // Use the enum
  ownership: Ownership; // Use the enum
  type: TransactionType; // Use the enum
  paymentDate: string | null; // YYYY-MM-DD or null
  accountId?: string; // Optional: Use if it's a bank account transaction
  creditCardId?: string; // Optional: Use if it's a credit card transaction
  notes: string | null;
}

export interface CreateTransactionPayload {
  // Renamed original to avoid conflict
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
  transactions: CreateTransactionPayload[]; // Use renamed payload type
}

// --- API Response Interfaces ---

// Matches the main event structure from the API (getEvents)
export interface Event {
  id: string;
  description: string;
  date: {
    // Note the nested 'value' object for date
    value: string; // YYYY-MM-DD
  };
  category: Category; // Uses the imported Category type
  negotiatorId: string; // Assuming negotiator details might be fetched separately if needed
  transactions: TransactionPayload[]; // Array of related transactions (using the new TransactionPayload)
}

// Generic type for paginated API responses
export interface PaginatedData<T> {
  data: T[];
  total: number;
  // Add other pagination fields if your API returns them (e.g., page, limit, hasNextPage)
}

// Generic API response structure
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

interface CreateEventResponse {
  // Keep specific response for createEvent if different
  success: boolean;
  message?: string;
  // Use unknown instead of any for better type safety
  data?: unknown;
}

// --- API Functions ---

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

// Function to fetch events with filters and pagination
export async function getEvents(params: {
  page: number;
  limit: number;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  // Add other potential filters here later: accountId, categoryId, type, searchTerm etc.
}): Promise<ApiResponse<PaginatedData<Event>>> {
  // Use the correct environment variable
  const apiUrl = import.meta.env.VITE_API_BASE_URL;
  if (!apiUrl) {
    // Keep the error message consistent
    console.error("VITE_API_BASE_URL não está definida no .env");
    throw new Error("Configuração de API ausente.");
  }

  // Construct query parameters
  const queryParams = new URLSearchParams({
    page: params.page.toString(),
    limit: params.limit.toString(),
    from: params.from,
    to: params.to,
    // Append other filters if they exist in params
  });

  // Add other optional filters if provided
  // if (params.accountId) queryParams.append('accountId', params.accountId);
  // if (params.categoryId) queryParams.append('categoryId', params.categoryId);
  // etc.

  const response = await fetch(`${apiUrl}/events?${queryParams.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      // Add Authorization header if needed:
      // 'Authorization': `Bearer ${your_token}`
    },
  });

  if (!response.ok) {
    // Handle API errors (e.g., 4xx, 5xx)
    const errorData = await response.json().catch(() => ({})); // Try to parse error body
    console.error("API Error Response:", errorData);
    throw new Error(
      `Failed to fetch events: ${response.statusText} - ${
        errorData.message || "Unknown error"
      }`
    );
  }

  const result: ApiResponse<PaginatedData<Event>> = await response.json();

  if (!result.success) {
    // Handle cases where API returns success: false
    console.error("API returned non-success:", result);
    throw new Error(result.message || "API request failed.");
  }

  return result;
}
