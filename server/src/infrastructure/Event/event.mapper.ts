// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable } from '@nestjs/common';
import { Event } from '../../domain/Event/event.entity';
import { EventEntity } from './event.orm-entity';
import { Mapper } from '../common/repository.interface';
import { Money } from '../../common/types/money';

@Injectable()
export class EventMapper implements Mapper<Event, EventEntity> {
  toDomain(orm: EventEntity): Event {
    return new Event(
      orm.id,
      orm.description,
      new Money(orm.amount),
      orm.installments,
      orm.competenceDate,
      orm.type,
      orm.categoryId,
      orm.expectedRefundAmount
        ? new Money(orm.expectedRefundAmount)
        : undefined,
    );
  }

  toOrm(domain: Event): EventEntity {
    const orm = new EventEntity();
    orm.id = domain.id;
    orm.description = domain.description;
    orm.amount = domain.amount.toCents();
    orm.installments = domain.installments;
    orm.competenceDate = domain.competenceDate;
    orm.type = domain.type;
    orm.categoryId = domain.categoryId;
    orm.expectedRefundAmount = domain.expectedRefundAmount?.toCents();
    return orm;
  }
}
