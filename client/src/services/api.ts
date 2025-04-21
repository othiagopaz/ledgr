// src/services/api.ts - Ponto central para exportações de serviços ou config. de API comum

// Define e exporta o tipo unificado
export interface FinancialInstrument {
  id: string;
  name: string;
  kind: "ACCOUNT" | "CREDIT_CARD"; // Differentiator
  displayDetail: string; // Add field for formatted type/flag
}

// Exporta tudo de Account.ts para manter um ponto de entrada (opcional)
export * from "./Account";
export * from "./CreditCard";
export * from "./Category";
export * from "./Event";

// No futuro, podemos adicionar exportações para outros serviços:
// export * from './Transaction';

// Ou definir constantes/helpers de API comuns aqui.
