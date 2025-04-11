import { Module } from '@nestjs/common';
import { CategoryService } from './services/category.service';
import { CategoryController } from './controllers/category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryRepository } from './infra/category.repository';
import { CategoryMapper } from './infra/category.mapper';
import { CategoryEntity } from './infra/category.orm-entity';
import { CATEGORY_REPOSITORY } from '../shared/infra/repository.tokens';

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
