import { AccountType } from '../../../utils/shared/enums/account-type.enum';
import { Money } from '../../../utils/shared/types/money';

export class Account {
  constructor(
    public readonly id: string,
    public name: string,
    public type: AccountType,
    public initialBalance: Money,
    public institution?: string,
    public color?: string,
    public isArchived?: boolean,
    public userId?: string,
  ) {}

  archive() {
    this.isArchived = true;
  }

  unarchive() {
    this.isArchived = false;
  }
}
