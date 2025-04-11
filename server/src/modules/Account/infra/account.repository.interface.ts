import { Account } from '../domain/account.entity';
import { IRepository } from '../../../utils/shared/infra/repository.interface';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IAccountRepository extends IRepository<Account> {}

export const IAccountRepository = Symbol('IAccountRepository');
