import { TransactionProps } from '../../Transaction/domain/transaction.types';
import { Category } from '../../Category/domain/category.entity';

export type EventProps = {
  description: string;
  date: Date;
  category: Category;
  negotiatorId: string;
  transactions?: TransactionProps[];
};
