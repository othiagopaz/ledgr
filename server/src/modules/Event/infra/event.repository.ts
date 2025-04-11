import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EventEntity } from './event.orm-entity';
import { Event } from '../domain/event.entity';
import { EventMapper } from './event.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { IEventRepository } from './event.repository.interface';

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
}
