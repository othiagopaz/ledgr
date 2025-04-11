// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable } from '@nestjs/common';
import { Event } from '../domain/event.entity';
import { EventEntity } from './event.orm-entity';
import { Mapper } from '../../../core/shared/infra/repository.interface';

@Injectable()
export class EventMapper implements Mapper<Event, EventEntity> {
  toDomain(orm: EventEntity): Event {
    return new Event(
      orm.id,
      orm.description,
      orm.date,
      orm.negotiatorId,
      orm.categoryId,
    );
  }

  toOrm(domain: Event): EventEntity {
    const orm = new EventEntity();
    orm.id = domain.id;
    orm.description = domain.description;
    orm.date = domain.date;
    orm.negotiatorId = domain.negotiatorId;
    orm.categoryId = domain.categoryId;
    return orm;
  }
}
