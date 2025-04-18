export interface Mapper<TDomain, TOrm> {
  toDomain(ormEntity: TOrm): TDomain;
  toOrm(domainEntity: TDomain): TOrm;
}

export interface IRepository<TDomain> {
  save(domain: TDomain): Promise<TDomain>;
  saveMany(domains: TDomain[]): Promise<TDomain[]>;
  findById(id: string): Promise<TDomain | null>;
  findAll(): Promise<TDomain[]>;
  delete(id: string): Promise<void>;
  findWithFilters(filters: any): Promise<TDomain[]>;
  findOne(filters: any): Promise<TDomain | null>;
}
