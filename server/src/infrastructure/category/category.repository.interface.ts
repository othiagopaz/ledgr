import { Category } from '../../domain/Category/category.entity';
import { IRepository } from '../common/repository.interface';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ICategoryRepository extends IRepository<Category> {}

export const ICategoryRepository = Symbol('ICategoryRepository');
