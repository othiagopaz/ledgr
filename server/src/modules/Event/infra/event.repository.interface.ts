import { Event } from '../domain/event.entity';
import { IRepository } from '../../../core/shared/infra/repository.interface';

export type IEventRepository = IRepository<Event>;

export const IEventRepository = Symbol('IEventRepository');
