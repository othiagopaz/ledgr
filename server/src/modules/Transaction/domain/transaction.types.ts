import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import { Event } from '../../Event/domain/event.entity';
import { Account } from '../../Account/domain/account.entity';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';
import { PlainDate } from '../../../utils/shared/types/plain-date';
export type SettlementCreationData = {
  negotiatorId: string;
  amount: number;
  dueDate: PlainDate;
  status: SettlementStatus;
  direction: SettlementDirection;
  paymentDate?: PlainDate;
  account?: Account;
  creditCard?: CreditCard;
  notes?: string;
};

export type TransactionProps = {
  event: Event;
  amount: number;
  dueDate: PlainDate;
  competenceDate: PlainDate;
  installmentNumber: number;
  status: TransactionStatus;
  ownership: Ownership;
  type: TransactionType;
  paymentDate?: PlainDate;
  account?: Account;
  creditCard?: CreditCard;
  notes?: string;
  settlements?: SettlementCreationData[];
};
