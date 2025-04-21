import { Event } from '../domain/event.entity';
import { IRepository } from '../../../utils/shared/infra/repository.interface';

export interface IEventRepository extends IRepository<Event> {
  findWithPagination(
    page: number,
    limit: number,
    from: Date,
    to: Date,
  ): Promise<{ data: Event[]; total: number }>;
}

export const EVENT_REPOSITORY = Symbol('EVENT_REPOSITORY');
