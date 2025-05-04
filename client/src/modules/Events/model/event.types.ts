import {
  Category,
  CategoryGroup,
  TransactionType,
} from "@/modules/Category/model/category.types";
import {
  FinancialInstrument,
  FinancialInstrumentType,
} from "@/modules/FinancialInstrument/model/financial-instrument.types";

export type EventApiResponse = {
  success: boolean;
  data: {
    data: Event[];
    total: number;
  };
  message: string;
};

export type Event = {
  id: string;
  description: string;
  date: {
    value: string;
  };
  category: Category;
  negotiatorId?: string;
  transactions: Transaction[];
};

export enum TransactionStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
  SCHEDULED = "SCHEDULED",
}

export enum Ownership {
  OWN = "OWN",
  SHARED = "SHARED",
}

export type Transaction = {
  id: string;
  eventId: string;
  amount: number;
  dueDate: string;
  installmentNumber: number;
  competenceDate: string;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: string;
  accountId?: string;
  creditCardId?: string;
  notes?: string;
};

export type CreateEventDto = {
  description: string;
  date: string;
  categoryId: string;
  negotiatorId?: string;
  transactions: CreateTransactionDto[];
};

export enum SettlementStatus {
  EXPECTED = "EXPECTED",
  PAID = "PAID",
  CANCELED = "CANCELED",
}

export enum SettlementDirection {
  RECEIVABLE = "RECEIVABLE",
  PAYABLE = "PAYABLE",
}

export type CreateSettlementDto = {
  originalTransactionId?: string;
  linkedTransactionId?: string;
  negotiatorId: string;
  amount: number;
  dueDate: string;
  status: SettlementStatus;
  direction: SettlementDirection;
  accountId: string;
  paymentDate?: string;
  notes?: string;
};

export type CreateTransactionDto = {
  amount: number;
  installmentNumber: number;
  dueDate: string;
  competenceDate: string;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: string;
  accountId?: string;
  creditCardId?: string;
  notes?: string;
  settlements?: CreateSettlementDto[];
};

export interface TransactionRow {
  id: string;
  eventId: string;
  date: string;
  type: string;
  description: string;
  negotiatorId: string;
  categoryId: string;
  categoryName: string;
  accountOrCard: {
    name: string;
    type: FinancialInstrumentType;
    helper: string;
  };
  value: number;
  status: string;
}

export function flattenTransactions(
  events: Event[],
  categories: CategoryGroup[],
  financialInstruments: FinancialInstrument[]
): TransactionRow[] {
  return events.flatMap((event) =>
    event.transactions.map((transaction) => {
      // 1. Buscar nome da categoria correta olhando apenas nas OPTIONS
      let categoryName = event.category.name;
      for (const group of categories) {
        const foundOption = group.options.find(
          (opt) => opt.id === event.category.id
        );
        if (foundOption) {
          categoryName = foundOption.name;
          break;
        }
      }

      let accountOrCardEntity: FinancialInstrument | null = null;

      if (transaction.accountId) {
        accountOrCardEntity =
          financialInstruments.find((fi) => fi.id === transaction.accountId) ??
          null;
      }

      if (transaction.creditCardId) {
        accountOrCardEntity =
          financialInstruments.find(
            (fi) => fi.id === transaction.creditCardId
          ) ?? null;
      }

      return {
        id: transaction.id,
        eventId: event.id,
        date: transaction.competenceDate,
        type: transaction.type,
        description: event.description,
        negotiatorId: event.negotiatorId ?? "N/A",
        categoryId: event.category.id,
        categoryName: categoryName,
        accountOrCard: {
          id: accountOrCardEntity?.id ?? "N/A",
          name: accountOrCardEntity?.name ?? "N/A",
          type: accountOrCardEntity?.type ?? "N/A",
          helper: accountOrCardEntity?.helper ?? "N/A",
        },
        value: transaction.amount,
        status: transaction.status,
      };
    })
  );
}
