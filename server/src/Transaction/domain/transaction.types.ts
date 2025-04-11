import { TransactionStatus } from '../../shared/enums/transaction-status.enum';
import { Ownership } from '../../shared/enums/ownership.enum';
import { TransactionType } from '../../shared/enums/transaction-type.enum';

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
