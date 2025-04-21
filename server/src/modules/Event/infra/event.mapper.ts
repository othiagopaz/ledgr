import { Injectable } from '@nestjs/common';
import { Event } from '../domain/event.entity';
import { EventEntity } from './event.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';
import { CategoryMapper } from '../../Category/infra/category.mapper';
import { TransactionMapper } from '../../Transaction/infra/transaction.mapper';
import { PlainDate } from '../../../utils/shared/types/plain-date';
@Injectable()
export class EventMapper implements Mapper<Event, EventEntity> {
  constructor(
    private readonly categoryMapper: CategoryMapper,
    private readonly transactionMapper: TransactionMapper,
  ) {}

  toDomain(orm: EventEntity): Event {
    const event = new Event(
      orm.id,
      orm.description,
      PlainDate.parse(orm.date),
      this.categoryMapper.toDomain(orm.category),
      orm.negotiatorId ?? undefined,
      orm.transactions
        ? orm.transactions.map((tx) => this.transactionMapper.toDomain(tx))
        : [],
    );

    return event;
  }

  toOrm(domain: Event): EventEntity {
    const orm = new EventEntity();
    orm.id = domain.id;
    orm.description = domain.description;
    orm.date = domain.date.toDate();
    orm.negotiatorId = domain.negotiatorId ?? undefined;
    orm.category = this.categoryMapper.toOrm(domain.category);
    orm.transactions = domain.transactions
      ? domain.transactions.map((tx) => this.transactionMapper.toOrm(tx))
      : [];
    return orm;
  }
}
