import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from '../../domain/category/category.entity';
import { CategoryEntity } from './category.orm-entity';
import { CategoryMapper } from './category.mapper';
import { BaseRepository } from '../common/base.repository';

@Injectable()
export class CategoryRepository extends BaseRepository<
  Category,
  CategoryEntity
> {
  constructor(
    @InjectRepository(CategoryEntity)
    repo: Repository<CategoryEntity>,
    mapper: CategoryMapper,
  ) {
    super(repo, mapper);
  }
}
