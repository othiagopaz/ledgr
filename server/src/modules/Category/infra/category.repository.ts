import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findTransferCategory(): Promise<Category[]> {
    //FIXME: this is a temporary solution, we need to find a better way to do this
    const categories = await this.findWithFilters({
      isDefault: true,
      name: 'Transference',
    });
    if (!categories) {
      throw new NotFoundException('Transferência categories not found');
    }
    return categories;
  }

  // Remove the getRelations override to avoid eager loading parentCategory
  // protected override getRelations(): string[] {
  //   return ['parentCategory'];
  // }
}
