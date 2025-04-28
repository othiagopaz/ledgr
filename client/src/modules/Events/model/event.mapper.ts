import { Event, EventApiResponse } from "../model/event.types";

export function normalizeEvents(apiResponse: EventApiResponse): {
  events: Event[];
  total: number;
} {
  const { data, total } = apiResponse.data;

  const normalized = data.map((event) => ({
    id: event.id,
    description: event.description,
    date: {
      value: event.date.value ?? "",
    },
    negotiatorId: event.negotiatorId ?? undefined,
    category: {
      id: event.category.id,
      name: event.category.name,
      color: event.category.color,
      type: event.category.type,
      isDefault: event.category.isDefault,
      isArchived: event.category.isArchived,
      userId: event.category.userId,
      subcategories: event.category.subcategories,
    },
    transactions: event.transactions?.map((tx) => ({
      id: tx.id,
      eventId: tx.eventId,
      amount: tx.amount,
      dueDate: tx.dueDate,
      competenceDate: tx.competenceDate,
      paymentDate: tx.paymentDate ?? null,
      status: tx.status,
      ownership: tx.ownership,
      type: tx.type,
      accountId: tx.accountId ?? undefined,
      creditCardId: tx.creditCardId ?? undefined,
      notes: tx.notes ?? undefined,
    })),
  }));

  return {
    events: normalized as Event[],
    total,
  };
}
