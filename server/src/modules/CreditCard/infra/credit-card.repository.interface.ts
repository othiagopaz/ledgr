import { IRepository } from '../../../utils/shared/infra/repository.interface';
import { CreditCard } from '../domain/credit-card.entity';

export type ICreditCardRepository = IRepository<CreditCard>;

export const CREDIT_CARD_REPOSITORY = Symbol('CREDIT_CARD_REPOSITORY');
