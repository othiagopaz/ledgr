import { Category } from '../../Category/domain/category.entity';
import { Account } from '../../Account/domain/account.entity';
import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';

// New type for transaction data needed during event creation
export type TransactionCreationData = {
  amount: number;
  dueDate: Date;
  competenceDate: Date;
  installmentNumber: number;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: Date;
  account?: Account; // Pass the fetched Account entity
  creditCardId?: string;
  notes?: string;
};

export type EventProps = {
  description: string;
  date: Date;
  category: Category;
  negotiatorId: string;
  transactions?: TransactionCreationData[]; // Use the new type
};
