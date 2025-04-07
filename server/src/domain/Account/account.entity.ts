import { AccountType } from '../../common/enums/account-type.enum';

export class Account {
  constructor(
    public readonly id: string,
    public name: string,
    public type: AccountType,
    public initialBalance: number,
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
