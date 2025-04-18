import { IRepository } from '../../../utils/shared/infra/repository.interface';
import { Settlement } from '../domain/settlement.entity';

export type ISettlementRepository = IRepository<Settlement>;

export const SETTLEMENT_REPOSITORY = Symbol('SETTLEMENT_REPOSITORY');
