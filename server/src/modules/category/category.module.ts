import { Module } from '@nestjs/common';
import { CategoryService } from './services/category.service';
import { CategoryController } from './controllers/category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryRepository } from '../../infrastructure/category/category.repository';
import { CategoryMapper } from '../../infrastructure/category/category.mapper';
import { CategoryEntity } from '../../infrastructure/category/category.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity])],
  providers: [CategoryService, CategoryRepository, CategoryMapper],
  controllers: [CategoryController],
  exports: [CategoryService],
})
export class CategoryModule {}
