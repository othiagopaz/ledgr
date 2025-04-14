import { Injectable } from '@nestjs/common';
import { Category } from '../domain/category.entity';
import { CategoryEntity } from './category.orm-entity';
import { Mapper } from '../../../utils/shared/infra/repository.interface';

@Injectable()
export class CategoryMapper implements Mapper<Category, CategoryEntity> {
  toDomain(orm: CategoryEntity): Category {
    const parentDomain = orm.parentCategory
      ? this.toDomain(orm.parentCategory)
      : undefined;

    return new Category(
      orm.id,
      orm.name,
      orm.type,
      orm.color,
      orm.isDefault,
      orm.isArchived,
      orm.userId,
      orm.parentCategoryId,
      parentDomain,
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
    // Set the foreign key primarily from parentCategoryId if available,
    // otherwise fallback to the id from the parentCategory object if present.
    orm.parentCategoryId = domain.parentCategoryId ?? domain.parentCategory?.id;
    // We don't map the full parentCategory back to the ORM entity here,
    // TypeORM uses the foreign key (parentCategoryId).
    return orm;
  }
}
