import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';
import { Transaction } from '../../Transaction/domain/transaction.entity';

export type SettlementProps = {
  originalTransaction: Transaction;
  negotiatorId: string;
  amount: number;
  dueDate: Date;
  status: SettlementStatus;
  direction: SettlementDirection;
  linkedTransaction?: Transaction;
  paymentDate?: Date;
  accountId?: string;
  notes?: string;
};
