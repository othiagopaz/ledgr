import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from '../../domain/Category/category.entity';
import { CategoryEntity } from '../Category/category.orm-entity';
import { CategoryMapper } from '../Category/category.mapper';
import { BaseRepository } from '../common/base.repository';
import { ICategoryRepository } from '../Category/category.repository.interface';

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
