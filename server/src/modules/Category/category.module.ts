import { Module } from '@nestjs/common';
import { CategoryService } from './services/category.service';
import { CategoryController } from './controllers/category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CATEGORY_REPOSITORY } from './infra/category.repository.interface';
import { CategoryMapper } from './infra/category.mapper';
import { CategoryEntity } from './infra/category.orm-entity';
import { CategoryRepository } from './infra/category.repository';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity])],
  providers: [
    CategoryService,
    {
      provide: CATEGORY_REPOSITORY,
      useClass: CategoryRepository,
    },
    CategoryMapper,
  ],
  controllers: [CategoryController],
  exports: [CategoryService, CategoryMapper, CATEGORY_REPOSITORY],
})
export class CategoryModule {}
