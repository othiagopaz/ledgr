import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { CategoryRepository } from '../repositories/category.repository';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { Category } from '@/domain/category/category.entity';
import { UpdateCategoryDto } from '../dtos/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const category = new Category(
      uuidv4(),
      dto.name,
      dto.type,
      dto.color,
      dto.isDefault ?? false,
      dto.isArchived ?? false,
      dto.userId,
      dto.parentCategoryId,
    );

    return this.categoryRepository.save(category);
  }

  async findAll(): Promise<Category[]> {
    return this.categoryRepository.findAll();
  }

  async findById(id: string): Promise<Category | null> {
    return this.categoryRepository.findById(id);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    category.update(dto);
    return this.categoryRepository.save(category);
  }

  async findSubcategories(id: string): Promise<Category[]> {
    return this.categoryRepository.findWithFilters({ parentCategoryId: id });
  }
}
