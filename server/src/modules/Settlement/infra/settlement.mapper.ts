import { Injectable } from '@nestjs/common';
import { Settlement } from '../domain/settlement.entity';
import { SettlementOrmEntity } from './settlement.orm-entity';
import { Money } from '../../../utils/shared/types/money';

@Injectable()
export class SettlementMapper {
  toDomainEntity(ormEntity: SettlementOrmEntity): Settlement {
    return new Settlement({
      id: ormEntity.id,
      transactionId: ormEntity.transactionId,
      negotiatorId: ormEntity.negotiatorId,
      amount: new Money(ormEntity.amount),
      dueDate: ormEntity.dueDate,
      status: ormEntity.status,
      direction: ormEntity.direction,
      paymentDate: ormEntity.paymentDate,
      accountId: ormEntity.accountId,
      notes: ormEntity.notes,
    });
  }

  toOrmEntity(domainEntity: Settlement): SettlementOrmEntity {
    const ormEntity = new SettlementOrmEntity();
    ormEntity.id = domainEntity.id;
    ormEntity.transactionId = domainEntity.transactionId;
    ormEntity.negotiatorId = domainEntity.negotiatorId;
    ormEntity.amount = domainEntity.amount.value;
    ormEntity.dueDate = domainEntity.dueDate;
    ormEntity.status = domainEntity.status;
    ormEntity.direction = domainEntity.direction;
    ormEntity.paymentDate = domainEntity.paymentDate;
    ormEntity.accountId = domainEntity.accountId;
    ormEntity.notes = domainEntity.notes;
    return ormEntity;
  }
}
