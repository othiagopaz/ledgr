import { Injectable } from '@nestjs/common';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { Settlement } from '../domain/settlement.entity';
import { SettlementEntity } from './settlement.orm-entity';
import { Money } from '../../../utils/shared/types/money';

@Injectable()
export class SettlementMapper implements Mapper<Settlement, SettlementEntity> {
  toDomain(orm: SettlementEntity): Settlement {
    return new Settlement(
      orm.id,
      orm.transactionId,
      orm.negotiatorId,
      new Money(orm.amount),
      orm.dueDate,
      orm.status,
      orm.direction,
      orm.paymentDate,
      orm.accountId,
      orm.notes,
    );
  }

  toOrm(domain: Settlement): SettlementEntity {
    const orm = new SettlementEntity();
    orm.id = domain.id;
    orm.transactionId = domain.transactionId;
    orm.negotiatorId = domain.negotiatorId;
    orm.amount = domain.amount.value;
    orm.dueDate = domain.dueDate;
    orm.status = domain.status;
    orm.direction = domain.direction;
    orm.paymentDate = domain.paymentDate;
    orm.accountId = domain.accountId;
    orm.notes = domain.notes;
    return orm;
  }
}
