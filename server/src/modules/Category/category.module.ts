import { Module } from '@nestjs/common';
import { CategoryService } from './services/category.service';
import { CategoryController } from './controllers/category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CATEGORY_REPOSITORY } from './infra/category.repository.interface';
import { CategoryMapper } from './infra/category.mapper';
import { CategoryEntity } from './infra/category.orm-entity';
import { CategoryRepository } from './infra/category.repository';
import { CategoryRelationEntity } from './infra/category-relation.orm-entity';
import { CategoryRelationRepository } from './infra/category-relation.repository';
@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity, CategoryRelationEntity])],
  providers: [
    CategoryService,
    {
      provide: CATEGORY_REPOSITORY,
      useClass: CategoryRepository,
    },
    CategoryMapper,
    CategoryRelationRepository,
  ],
  controllers: [CategoryController],
  exports: [CategoryService, CategoryMapper, CATEGORY_REPOSITORY],
})
export class CategoryModule {}
