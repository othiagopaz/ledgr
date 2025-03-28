// src/modules/installment/mappers/installment.mapper.ts
import { Injectable } from '@nestjs/common';

import { Transaction } from '../../domain/Transaction/transaction.entity';
import { TransactionEntity } from './transaction.orm-entity';
import { Mapper } from '../common/repository.interface';

@Injectable()
export class TransactionMapper
  implements Mapper<Transaction, TransactionEntity>
{
  toDomain(orm: TransactionEntity): Transaction {
    return new Transaction(
      orm.id,
      orm.eventId,
      orm.amount,
      orm.dueDate,
      orm.competenceDate,
      orm.status,
      orm.paymentDate,
      orm.accountId,
      orm.creditCardId,
      orm.isRefundable,
      orm.isShared,
      orm.notes,
    );
  }

  toOrm(domain: Transaction): TransactionEntity {
    const orm = new TransactionEntity();
    orm.id = domain.id;
    orm.eventId = domain.eventId;
    orm.amount = domain.amount;
    orm.dueDate = domain.dueDate;
    orm.competenceDate = domain.competenceDate;
    orm.status = domain.status;
    orm.paymentDate = domain.paymentDate;
    orm.accountId = domain.accountId;
    orm.creditCardId = domain.creditCardId;
    orm.notes = domain.notes;
    orm.isRefundable = domain.isRefundable;
    orm.isShared = domain.isShared;
    return orm;
  }
}
