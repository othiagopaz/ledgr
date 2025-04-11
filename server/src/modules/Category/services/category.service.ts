import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ICategoryRepository } from '../infra/category.repository.interface';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { Category } from '../domain/category.entity';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CATEGORY_REPOSITORY } from '../../../core/shared/infra/repository.tokens';
@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const category = new Category(
      uuidv4(),
      dto.name,
      dto.type,
      dto.color,
      dto.isDefault ?? false,
      dto.isArchived ?? false,
      dto.userId ?? undefined,
      dto.parentCategoryId ?? undefined,
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

    const updatedCategory = new Category(
      category.id,
      dto.name ?? category.name,
      dto.type ?? category.type,
      dto.color ?? category.color,
      dto.isDefault ?? category.isDefault,
      dto.isArchived ?? category.isArchived,
      dto.userId ?? category.userId,
      dto.parentCategoryId ?? category.parentCategoryId,
    );

    return this.categoryRepository.save(updatedCategory);
  }

  async findSubcategories(id: string): Promise<Category[]> {
    return this.categoryRepository.findWithFilters({ parentCategoryId: id });
  }
}
