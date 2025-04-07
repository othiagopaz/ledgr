import { Module } from '@nestjs/common';
import { CategoryService } from './services/category.service';
import { CategoryController } from './controllers/category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryRepository } from '../../infrastructure/Category/category.repository';
import { CategoryMapper } from '../../infrastructure/Category/category.mapper';
import { CategoryEntity } from '../../infrastructure/Category/category.orm-entity';
import { CATEGORY_REPOSITORY } from '../../infrastructure/common/repository.tokens';

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
  exports: [CategoryService],
})
export class CategoryModule {}
