import { EntryType } from '../../common/enums/entry-type.enum';
import { OwnershipType } from '../../common/enums/ownership-type.enum';
export type FinancialEntryProps = {
  description: string;
  amount: number;
  installments: number;
  date: Date;
  type: EntryType;
  categoryId: string;
  creditCardId?: string;
  accountId?: string;
  ownershipType: OwnershipType;
  expectedRefundAmount?: number;
  refundInstallments?: number;
  refundInstallmentDates?: Date[];
  isOffBalance: boolean;
};
