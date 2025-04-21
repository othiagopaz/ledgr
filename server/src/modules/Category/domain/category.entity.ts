import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';

export class Category {
  constructor(
    public readonly id: string,
    public name: string,
    public type: TransactionType,
    public color?: string,
    public isDefault?: boolean,
    public isArchived?: boolean,
    public userId?: string,
    public parentCategoryId?: string,
    public parentCategory?: Category,
    public subcategories?: Category[],
  ) {}

  archive() {
    this.isArchived = true;
  }

  unarchive() {
    this.isArchived = false;
  }
}
