// src/modules/installment/mappers/installment.mapper.ts
import { Injectable } from '@nestjs/common';
import { Money } from '../../../utils/shared/types/money';
import { Transaction } from '../domain/transaction.entity';
import { TransactionEntity } from './transaction.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { EventMapper } from '../../Event/infra/event.mapper';
import { AccountMapper } from '../../Account/infra/account.mapper';

@Injectable()
export class TransactionMapper
  implements Mapper<Transaction, TransactionEntity>
{
  constructor(
    private readonly eventMapper: EventMapper,
    private readonly accountMapper: AccountMapper,
  ) {}

  toDomain(orm: TransactionEntity): Transaction {
    return new Transaction(
      orm.id,
      this.eventMapper.toDomain(orm.event),
      new Money(orm.amount),
      orm.dueDate,
      orm.competenceDate,
      orm.installmentNumber,
      orm.status,
      orm.ownership,
      orm.type,
      orm.paymentDate,
      orm.account ? this.accountMapper.toDomain(orm.account) : undefined,
      orm.creditCardId,
      orm.notes,
    );
  }

  toOrm(domain: Transaction): TransactionEntity {
    const orm = new TransactionEntity();
    orm.id = domain.id;
    orm.event = this.eventMapper.toOrm(domain.event);
    orm.amount = domain.amount.toCents();
    orm.dueDate = domain.dueDate;
    orm.competenceDate = domain.competenceDate;
    orm.installmentNumber = domain.installmentNumber;
    orm.status = domain.status;
    orm.paymentDate = domain.paymentDate;
    orm.account = domain.account
      ? this.accountMapper.toOrm(domain.account)
      : undefined;
    orm.creditCardId = domain.creditCardId;
    orm.notes = domain.notes;
    orm.ownership = domain.ownership;
    orm.type = domain.type;
    return orm;
  }
}
