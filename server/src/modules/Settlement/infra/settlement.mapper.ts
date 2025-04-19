import { Injectable } from '@nestjs/common';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { Settlement } from '../domain/settlement.entity';
import { SettlementEntity } from './settlement.orm-entity';
import { Money } from '../../../utils/shared/types/money';
import { TransactionMapper } from '../../Transaction/infra/transaction.mapper';
import { PlainDate } from '../../../utils/shared/types/plain-date';
@Injectable()
export class SettlementMapper implements Mapper<Settlement, SettlementEntity> {
  constructor(private readonly transactionMapper: TransactionMapper) {}

  toDomain(orm: SettlementEntity): Settlement {
    return new Settlement(
      orm.id,
      this.transactionMapper.toDomain(orm.originalTransaction),
      orm.negotiatorId,
      new Money(orm.amount),
      PlainDate.fromDate(orm.dueDate),
      orm.status,
      orm.direction,
      orm.linkedTransaction
        ? this.transactionMapper.toDomain(orm.linkedTransaction)
        : undefined,
      orm.paymentDate ? PlainDate.fromDate(orm.paymentDate) : undefined,
      orm.accountId,
      orm.notes,
    );
  }

  toOrm(domain: Settlement): SettlementEntity {
    const orm = new SettlementEntity();
    orm.id = domain.id;
    orm.originalTransaction = this.transactionMapper.toOrm(
      domain.originalTransaction,
    );
    orm.negotiatorId = domain.negotiatorId;
    orm.amount = domain.amount.value;
    orm.dueDate = domain.dueDate.toDate();
    orm.status = domain.status;
    orm.direction = domain.direction;
    orm.linkedTransaction = domain.linkedTransaction
      ? this.transactionMapper.toOrm(domain.linkedTransaction)
      : null;
    orm.paymentDate = domain.paymentDate?.toDate();
    orm.accountId = domain.accountId;
    orm.notes = domain.notes;
    return orm;
  }
}
