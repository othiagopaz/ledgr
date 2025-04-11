// src/modules/installment/mappers/installment.mapper.ts
import { Injectable } from '@nestjs/common';
import { Money } from '../../shared/types/money';
import { Transaction } from '../domain/transaction.entity';
import { TransactionEntity } from './transaction.orm-entity';
import { Mapper } from '../../shared/infra/repository.interface';

@Injectable()
export class TransactionMapper
  implements Mapper<Transaction, TransactionEntity>
{
  toDomain(orm: TransactionEntity): Transaction {
    return new Transaction(
      orm.id,
      orm.eventId,
      new Money(orm.amount),
      orm.dueDate,
      orm.competenceDate,
      orm.installmentNumber,
      orm.status,
      orm.ownership,
      orm.type,
      orm.paymentDate,
      orm.accountId,
      orm.creditCardId,
      orm.notes,
    );
  }

  toOrm(domain: Transaction): TransactionEntity {
    const orm = new TransactionEntity();
    orm.id = domain.id;
    orm.eventId = domain.eventId;
    orm.amount = domain.amount.toCents();
    orm.dueDate = domain.dueDate;
    orm.competenceDate = domain.competenceDate;
    orm.installmentNumber = domain.installmentNumber;
    orm.status = domain.status;
    orm.paymentDate = domain.paymentDate;
    orm.accountId = domain.accountId;
    orm.creditCardId = domain.creditCardId;
    orm.notes = domain.notes;
    orm.ownership = domain.ownership;
    orm.type = domain.type;
    return orm;
  }
}
