import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryRelationEntity } from './category-relation.orm-entity';
import { CategoryEntity } from './category.orm-entity';
import {
  ICategoryRepository,
  CATEGORY_REPOSITORY,
} from './category.repository.interface';
@Injectable()
export class CategoryRelationRepository {
  constructor(
    @InjectRepository(CategoryRelationEntity)
    private readonly repo: Repository<CategoryRelationEntity>,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async findChildrenOf(parentId: string): Promise<CategoryEntity[]> {
    const relations = await this.repo.find({
      where: { parent: { id: parentId } },
      relations: ['child'],
    });

    return relations.map((relation) => relation.child);
  }

  async findAllRelations(): Promise<
    { parentId: string; child: CategoryEntity }[]
  > {
    const all = await this.repo.find({
      relations: ['parent', 'child'],
    });

    return all.map((rel) => ({
      parentId: rel.parent.id,
      child: rel.child,
    }));
  }

  async createRelation(parentId: string, childId: string): Promise<void> {
    const parent = await this.categoryRepository.findById(parentId);
    const child = await this.categoryRepository.findById(childId);

    if (!parent || !child) {
      throw new NotFoundException('Parent or child category not found');
    }

    await this.repo.save({ parent, child });
  }
}
