import { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import { IRepository, Mapper } from './repository.interface';

export abstract class BaseRepository<TDomain, TOrm extends ObjectLiteral>
  implements IRepository<TDomain>
{
  constructor(
    protected readonly ormRepo: Repository<TOrm>,
    protected readonly mapper: Mapper<TDomain, TOrm>,
  ) {}

  async save(domain: TDomain): Promise<TDomain> {
    const orm = this.mapper.toOrm(domain);
    const saved = await this.ormRepo.save(orm);
    return this.mapper.toDomain(saved);
  }

  async saveMany(domains: TDomain[]): Promise<TDomain[]> {
    const orms = domains.map((d) => this.mapper.toOrm(d));
    const saved = await this.ormRepo.save(orms);
    return saved.map((s) => this.mapper.toDomain(s));
  }

  async findById(id: string): Promise<TDomain | null> {
    const found = await this.ormRepo.findOne({
      where: { id } as any,
      relations: this.getRelations(),
    });
    return found ? this.mapper.toDomain(found) : null;
  }

  async findOne(filters: FindOptionsWhere<TOrm>): Promise<TDomain | null> {
    const found = await this.ormRepo.findOne({
      where: filters,
      relations: this.getRelations(),
    });
    console.log(
      'SQL Query:',
      this.ormRepo.createQueryBuilder().where(filters).getSql(),
    );
    return found ? this.mapper.toDomain(found) : null;
  }

  async findAll(): Promise<TDomain[]> {
    const all = await this.ormRepo.find({
      relations: this.getRelations(),
    });
    return all.map((f) => this.mapper.toDomain(f));
  }

  async delete(id: string): Promise<void> {
    await this.ormRepo.delete(id);
  }

  async findWithFilters(filters: any): Promise<TDomain[]> {
    const found = await this.ormRepo.find({ where: filters });
    return found.map((f) => this.mapper.toDomain(f));
  }

  protected getRelations(): string[] {
    return [];
  }
}
