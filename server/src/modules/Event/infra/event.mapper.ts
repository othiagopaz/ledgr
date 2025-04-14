// src/modules/financial-entry/mappers/financial-entry.mapper.ts
import { Injectable } from '@nestjs/common';
import { Event } from '../domain/event.entity';
import { EventEntity } from './event.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { CategoryMapper } from '../../Category/infra/category.mapper';

@Injectable()
export class EventMapper implements Mapper<Event, EventEntity> {
  constructor(private readonly categoryMapper: CategoryMapper) {}

  toDomain(orm: EventEntity): Event {
    return new Event(
      orm.id,
      orm.description,
      orm.date,
      this.categoryMapper.toDomain(orm.category),
      orm.negotiatorId,
    );
  }

  toOrm(domain: Event): EventEntity {
    const orm = new EventEntity();
    orm.id = domain.id;
    orm.description = domain.description;
    orm.date = domain.date;
    orm.negotiatorId = domain.negotiatorId;
    orm.category = this.categoryMapper.toOrm(domain.category);
    return orm;
  }
}
