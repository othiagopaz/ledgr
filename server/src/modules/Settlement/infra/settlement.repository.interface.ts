import { Settlement } from '../domain/settlement.entity';

export interface ISettlementRepository {
  save(settlement: Settlement): Promise<Settlement>;
  findById(id: string): Promise<Settlement | null>;
  findAll(): Promise<Settlement[]>;
  delete(id: string): Promise<void>;
}
