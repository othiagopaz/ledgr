import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { Ownership } from '../../common/enums/ownership.enum';
import { TransactionType } from '../../common/enums/transaction-type.enum';

export type TransactionProps = {
  eventId?: string;
  amount: number;
  dueDate: Date;
  competenceDate: Date;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: Date;
  accountId?: string;
  creditCardId?: string;
  notes?: string;
};
