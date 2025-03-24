// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable } from '@nestjs/common';

import { FinancialEntry } from '../../../domain/financial-entry/financial-entry.entity';
import { FinancialEntryEntity } from '../entities/financial-entry.orm-entity';
import { Mapper } from '../../../shared/base.repository';

@Injectable()
export class FinancialEntryMapper
  implements Mapper<FinancialEntry, FinancialEntryEntity>
{
  toDomain(orm: FinancialEntryEntity): FinancialEntry {
    return new FinancialEntry(
      orm.id,
      orm.description,
      orm.amount,
      orm.installments,
      orm.date,
      orm.type,
      orm.categoryId,
      orm.creditCardId,
      orm.accountId,
      orm.ownershipType,
      orm.expectedRefundAmount,
      orm.refundInstallments,
      orm.refundInstallmentDates,
      orm.isOffBalance,
    );
  }

  toOrm(domain: FinancialEntry): FinancialEntryEntity {
    const orm = new FinancialEntryEntity();
    orm.id = domain.id;
    orm.description = domain.description;
    orm.amount = domain.amount;
    orm.installments = domain.installments;
    orm.date = domain.date;
    orm.type = domain.type;
    orm.categoryId = domain.categoryId;
    orm.creditCardId = domain.creditCardId;
    orm.accountId = domain.accountId;
    orm.ownershipType = domain.ownershipType;
    orm.expectedRefundAmount = domain.expectedRefundAmount;
    orm.refundInstallments = domain.refundInstallments;
    orm.refundInstallmentDates = domain.refundInstallmentDates;
    orm.isOffBalance = domain.isOffBalance;
    return orm;
  }
}
