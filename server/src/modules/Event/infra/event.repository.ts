import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EventEntity } from './event.orm-entity';
import { Event } from '../domain/event.entity';
import { EventMapper } from './event.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { IEventRepository } from './event.repository.interface';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';

@Injectable()
export class EventRepository
  extends BaseRepository<Event, EventEntity>
  implements IEventRepository
{
  constructor(
    @InjectRepository(EventEntity)
    repo: Repository<EventEntity>,
    mapper: EventMapper,
  ) {
    super(repo, mapper);
  }

  async findWithPagination(
    page: number,
    limit: number,
    from: Date,
    to: Date,
  ): Promise<{ data: Event[]; total: number }> {
    const [ormEvents, total] = await this.ormRepo
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.category', 'category')
      .leftJoinAndSelect('event.transactions', 'transaction')
      .leftJoinAndSelect('transaction.account', 'account')
      .leftJoinAndSelect('transaction.creditCard', 'creditCard')
      .where('transaction.competenceDate BETWEEN :from AND :to', { from, to })
      .where('transaction.ownership = :ownership', { ownership: Ownership.OWN })
      .orderBy('event.date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const domainEvents = ormEvents.map((orm) => this.mapper.toDomain(orm));

    return {
      data: domainEvents,
      total,
    };
  }

  protected getRelations(): string[] {
    return [
      'category',
      'transactions',
      'transactions.account',
      'transactions.creditCard',
    ];
  }
}
