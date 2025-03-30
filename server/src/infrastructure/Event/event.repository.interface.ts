import { Event } from '../../domain/Event/event.entity';
import { IRepository } from '../common/repository.interface';

export type IEventRepository = IRepository<Event>;

export const IEventRepository = Symbol('IEventRepository');
