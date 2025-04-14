import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ICategoryRepository } from '../infra/category.repository.interface';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { Category } from '../domain/category.entity';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CATEGORY_REPOSITORY } from '../infra/category.repository';

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

    if (
      dto.parentCategoryId !== undefined &&
      dto.parentCategoryId !== category.parentCategoryId
    ) {
      if (dto.parentCategoryId !== null) {
        const parentExists = await this.categoryRepository.findById(
          dto.parentCategoryId,
        );
        if (!parentExists) {
          throw new NotFoundException(
            `Parent category with ID ${dto.parentCategoryId} not found.`,
          );
        }
      }
    }

    category.name = dto.name ?? category.name;
    category.type = dto.type ?? category.type;
    category.color = dto.color ?? category.color;
    category.isDefault = dto.isDefault ?? category.isDefault;
    category.isArchived = dto.isArchived ?? category.isArchived;
    category.userId = dto.userId ?? category.userId;
    category.parentCategoryId =
      dto.parentCategoryId === undefined
        ? category.parentCategoryId
        : dto.parentCategoryId === null
          ? undefined
          : dto.parentCategoryId;
    if (category.parentCategoryId == null) {
      category.parentCategory = undefined;
    }

    return this.categoryRepository.save(category);
  }

  async findSubcategories(id: string): Promise<Category[]> {
    return this.categoryRepository.findWithFilters({ parentCategoryId: id });
  }
}
