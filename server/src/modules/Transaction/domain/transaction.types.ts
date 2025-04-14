import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import { Event } from '../../Event/domain/event.entity';
import { Account } from '../../Account/domain/account.entity';

export type TransactionProps = {
  event: Event;
  amount: number;
  dueDate: Date;
  competenceDate: Date;
  installmentNumber: number;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: Date;
  account?: Account;
  creditCardId?: string;
  notes?: string;
};
