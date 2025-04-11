import { Category } from '../domain/category.entity';
import { IRepository } from '../../../core/shared/infra/repository.interface';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ICategoryRepository extends IRepository<Category> {}

export const ICategoryRepository = Symbol('ICategoryRepository');
