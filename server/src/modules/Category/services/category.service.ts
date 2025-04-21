import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY,
} from '../infra/category.repository.interface';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { Category } from '../domain/category.entity';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CategoryRelationRepository } from '../infra/category-relation.repository';

@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    private readonly categoryRelationRepository: CategoryRelationRepository,
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
    );

    const saved = await this.categoryRepository.save(category);

    if (dto.parentCategoryId) {
      const parent = await this.categoryRepository.findById(
        dto.parentCategoryId,
      );
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }

      await this.categoryRelationRepository.createRelation(
        dto.parentCategoryId,
        saved.id,
      );
    }

    return saved;
  }

  async findActiveCategories(): Promise<Category[]> {
    const categories = await this.categoryRepository.findWithFilters({
      isArchived: false,
    });

    const relations = await this.categoryRelationRepository.findAllRelations();

    const map = new Map<string, Category>();
    categories.forEach((cat) => {
      cat.subcategories = [];
      map.set(cat.id, cat);
    });

    for (const rel of relations) {
      const parent = map.get(rel.parentId);
      const child = map.get(rel.child.id);
      if (parent && child) {
        parent.subcategories!.push(child);
      }
    }

    const rootCategories = categories.filter(
      (cat) => !relations.some((rel) => rel.child.id === cat.id),
    );

    return rootCategories;
  }

  async findById(id: string): Promise<Category | null> {
    return this.categoryRepository.findById(id);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    category.name = dto.name ?? category.name;
    category.type = dto.type ?? category.type;
    category.color = dto.color ?? category.color;
    category.isDefault = dto.isDefault ?? category.isDefault;
    category.isArchived = dto.isArchived ?? category.isArchived;
    category.userId = dto.userId ?? category.userId;

    return this.categoryRepository.save(category);
  }
}
