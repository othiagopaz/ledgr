import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export type TransactionProps = {
  eventId: string;
  amount: number;
  dueDate: Date;
  competenceDate: Date;
  status: TransactionStatus;
  paymentDate?: Date;
  accountId?: string;
  creditCardId?: string;
  isRefundable?: boolean;
  isShared?: boolean;
  notes?: string;
};
