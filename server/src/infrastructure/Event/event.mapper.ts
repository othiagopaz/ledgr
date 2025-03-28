// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable } from '@nestjs/common';

import { Event } from '../../domain/Event/event.entity';
import { EventEntity } from './event.orm-entity';
import { Mapper } from '../common/repository.interface';

@Injectable()
export class EventMapper implements Mapper<Event, EventEntity> {
  toDomain(orm: EventEntity): Event {
    return new Event(
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

  toOrm(domain: Event): EventEntity {
    const orm = new EventEntity();
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
