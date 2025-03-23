import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';
import { FinancialEntryEntity } from '../entities/financial-entry.orm-entity';

export function mapToDomain(entity: FinancialEntryEntity): FinancialEntry {
  return new FinancialEntry(
    entity.id,
    entity.description,
    Number(entity.amount),
    entity.installments,
    new Date(entity.date),
    entity.type,
    entity.categoryId,
    entity.creditCardId,
    entity.accountId,
  );
}

export function mapToOrm(entry: FinancialEntry): FinancialEntryEntity {
  const entity = new FinancialEntryEntity();
  entity.id = entry.id;
  entity.description = entry.description;
  entity.amount = entry.amount;
  entity.installments = entry.installments;
  entity.date = entry.date;
  entity.type = entry.type;
  entity.categoryId = entry.categoryId;
  entity.creditCardId = entry.creditCardId;
  entity.accountId = entry.accountId;
  return entity;
}
