import { Injectable } from '@nestjs/common';
import { Category } from '../domain/category.entity';
import { CategoryEntity } from './category.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';

@Injectable()
export class CategoryMapper implements Mapper<Category, CategoryEntity> {
  toDomain(orm: CategoryEntity): Category {
    return new Category(
      orm.id,
      orm.name,
      orm.type,
      orm.color,
      orm.isDefault,
      orm.isArchived,
      orm.userId,
      [],
    );
  }

  toOrm(domain: Category): CategoryEntity {
    const orm = new CategoryEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.type = domain.type;
    orm.color = domain.color;
    orm.isDefault = domain.isDefault ?? false;
    orm.isArchived = domain.isArchived ?? false;
    orm.userId = domain.userId;
    return orm;
  }
}
