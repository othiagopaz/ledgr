import { Account } from '../../domain/Account/account.entity';
import { IRepository } from '../common/repository.interface';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IAccountRepository extends IRepository<Account> {}

export const IAccountRepository = Symbol('IAccountRepository');
