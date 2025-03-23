import { EntryType } from '@/shared/enums/entry-type.enum';

export type FinancialEntryProps = {
  description: string;
  amount: number;
  installments: number;
  date: Date;
  type: EntryType;
  categoryId: string;
  creditCardId?: string;
  accountId?: string;
};
