import { TransactionProps } from '../../Transaction/domain/transaction.types';
export type EventProps = {
  description: string;
  date: Date;
  categoryId: string;
  negotiatorId: string;
  transactions?: TransactionProps[];
};
