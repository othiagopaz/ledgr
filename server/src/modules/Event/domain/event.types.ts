import { Category } from '../../Category/domain/category.entity';
import { Account } from '../../Account/domain/account.entity';
import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import { SettlementCreationData } from '../../Transaction/domain/transaction.types';
import { CreditCard } from '../../CreditCard/domain/credit-card.entity';
import { PlainDate } from '../../../utils/shared/types/plain-date';
export type TransactionCreationData = {
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

export type EventProps = {
  description: string;
  date: PlainDate;
  category: Category;
  negotiatorId?: string;
  transactions?: TransactionCreationData[];
};
