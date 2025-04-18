import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { TransactionEntity } from '../../Transaction/infra/transaction.orm-entity';
import { CreditCardEntity } from '../../CreditCard/infra/credit-card.orm-entity';

@Entity('invoices')
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false, name: 'reference_month' })
  referenceMonth: number;

  @Column({ nullable: false, name: 'reference_year' })
  referenceYear: number;

  @Column({ nullable: false, name: 'closing_date' })
  closingDate: Date;

  @Column({ nullable: false, name: 'due_date' })
  dueDate: Date;

  @Column({ nullable: false, name: 'status' })
  status: InvoiceStatus;

  @Column({ nullable: true, name: 'payment_date' })
  paymentDate?: Date;

  @Column({ nullable: true, name: 'account_id' })
  accountId?: string;

  @ManyToOne(() => CreditCardEntity, { nullable: false })
  @JoinColumn({ name: 'credit_card_id' })
  creditCard: CreditCardEntity;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.invoice)
  transactions: TransactionEntity[];
}
