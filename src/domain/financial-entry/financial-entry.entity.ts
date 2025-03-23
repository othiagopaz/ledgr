import { v4 as uuidv4 } from 'uuid';
import { EntryType } from '../../shared/enums/entry-type.enum';
import { FinancialEntryProps } from './financial-entry.types';

export class FinancialEntry {
  constructor(
    public readonly id: string,
    public readonly description: string,
    public readonly amount: number,
    public readonly installments: number,
    public readonly date: Date,
    public readonly type: EntryType,
    public readonly categoryId: string,
    public readonly creditCardId?: string,
    public readonly accountId?: string,
  ) {}

  static create(props: FinancialEntryProps): FinancialEntry {
    return new FinancialEntry(
      uuidv4(),
      props.description,
      props.amount,
      props.installments,
      props.date,
      props.type,
      props.categoryId,
      props.creditCardId,
      props.accountId,
    );
  }

  isIncome(): boolean {
    return this.type === EntryType.INCOME;
  }

  isExpense(): boolean {
    return this.type === EntryType.EXPENSE;
  }
}
