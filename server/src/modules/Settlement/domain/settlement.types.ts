import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';
import { Transaction } from '../../Transaction/domain/transaction.entity';
import { PlainDate } from '../../../utils/shared/types/plain-date';
export type SettlementProps = {
  originalTransaction: Transaction;
  negotiatorId: string;
  amount: number;
  dueDate: PlainDate;
  status: SettlementStatus;
  direction: SettlementDirection;
  linkedTransaction?: Transaction;
  paymentDate?: PlainDate;
  accountId?: string;
  notes?: string;
};
