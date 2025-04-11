import { TransactionStatus } from '../../../core/shared/enums/transaction-status.enum';
import { Ownership } from '../../../core/shared/enums/ownership.enum';
import { TransactionType } from '../../../core/shared/enums/transaction-type.enum';

export type TransactionProps = {
  eventId?: string;
  amount: number;
  dueDate: Date;
  competenceDate: Date;
  installmentNumber: number;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: Date;
  accountId?: string;
  creditCardId?: string;
  notes?: string;
};
