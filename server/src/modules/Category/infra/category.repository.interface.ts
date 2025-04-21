import { Category } from '../domain/category.entity';
import { IRepository } from '../../../utils/shared/infra/repository.interface';

export interface ICategoryRepository extends IRepository<Category> {
  findTransferCategory(): Promise<Category[]>;
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
