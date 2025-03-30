import { TransactionType } from '../../common/enums/transaction-type.enum';
import { TransactionProps } from '../Transaction/transaction.types';

export type EventProps = {
  description: string;
  amount: number;
  installments: number;
  competenceDate: Date;
  type: TransactionType;
  categoryId: string;
  expectedRefundAmount?: number;
  transactions?: TransactionProps[];
};
