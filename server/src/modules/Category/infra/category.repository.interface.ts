import { Category } from '../domain/category.entity';
import { IRepository } from '../../../utils/shared/infra/repository.interface';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ICategoryRepository extends IRepository<Category> {
  findTransferCategory(): Promise<Category[]>;
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
