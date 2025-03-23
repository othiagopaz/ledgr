import { Repository, FindOptionsWhere, ObjectLiteral } from 'typeorm';

export abstract class BaseRepository<T extends ObjectLiteral> {
  constructor(protected readonly ormRepo: Repository<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.ormRepo.findOne({ where: { id } as any });
  }

  async findAll(): Promise<T[]> {
    return this.ormRepo.find();
  }

  async save(entity: T): Promise<T> {
    return this.ormRepo.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.delete(id);
  }

  async update(id: string, partial: Partial<T>): Promise<void> {
    await this.ormRepo.update(id, partial);
  }

  async updateMultiple(ids: string[], partial: Partial<T>): Promise<void> {
    await this.ormRepo.update(ids, partial);
  }

  async findWithFilters(filters: FindOptionsWhere<T>): Promise<T[]> {
    return this.ormRepo.find({ where: filters });
  }
}
