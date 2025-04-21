// src/services/api.ts - Ponto central para exportações de serviços ou config. de API comum

// Importações não utilizadas, serão removidas
// import {
//   mapAccountToFinancialInstrument,
//   mapCreditCardToFinancialInstrument,
// } from "@/utils/mappers";
// import { TransactionStatus, TransactionType, Ownership } from "./Event"; // Enums are now exported directly from Event

// Define e exporta o tipo unificado
export interface FinancialInstrument {
  id: string;
  name: string;
  kind: "ACCOUNT" | "CREDIT_CARD"; // Differentiator
  displayDetail: string; // Add field for formatted type/flag
}

// Exporta tudo dos módulos de serviço
export * from "./Account";
export * from "./CreditCard";
export * from "./Category";
export * from "./Event"; // Now includes getEvents, Event, etc.

// --- Tipos e funções removidas (movidas para Event.ts) ---
// export interface TransactionPayload { ... }
// export interface Event { ... }
// export interface PaginatedData<T> { ... }
// export interface ApiResponse<T> { ... }
// export async function getEvents(...) { ... }

// --- Funções existentes (Assumindo que estão em seus respectivos arquivos e exportadas) ---

// Exemplo: getAccounts, getCreditCards, getCategories são exportadas de seus respectivos arquivos
// e re-exportadas pelas linhas `export * from ...` acima.
