import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from '../domain/category.entity';
import { CategoryEntity } from './category.orm-entity';
import { CategoryMapper } from './category.mapper';
import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { ICategoryRepository } from './category.repository.interface';

@Injectable()
export class CategoryRepository
  extends BaseRepository<Category, CategoryEntity>
  implements ICategoryRepository
{
  constructor(
    @InjectRepository(CategoryEntity)
    repo: Repository<CategoryEntity>,
    mapper: CategoryMapper,
  ) {
    super(repo, mapper);
  }
}

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
