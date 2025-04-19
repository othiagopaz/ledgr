import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { InvoiceStatus } from '../../../utils/shared/enums/invoice-status.enum';
import { TransactionEntity } from '../../Transaction/infra/transaction.orm-entity';
import { CreditCardEntity } from '../../CreditCard/infra/credit-card.orm-entity';

@Entity('invoices')
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false, name: 'reference_month', type: 'integer' })
  referenceMonth: number;

  @Column({ nullable: false, name: 'reference_year', type: 'integer' })
  referenceYear: number;

  @Column({ nullable: false, name: 'closing_date', type: 'date' })
  closingDate: Date;

  @Column({ nullable: false, name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({
    nullable: false,
    name: 'status',
    type: 'enum',
    enum: InvoiceStatus,
  })
  status: InvoiceStatus;

  @Column({ nullable: true, name: 'payment_date', type: 'date' })
  paymentDate?: Date;

  @Column({ nullable: true, name: 'account_id' })
  accountId?: string;

  @Column({ name: 'credit_card_id' })
  creditCardId: string;

  @ManyToOne(() => CreditCardEntity)
  @JoinColumn({ name: 'credit_card_id' })
  creditCard: CreditCardEntity;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.invoice)
  transactions: TransactionEntity[];

  @UpdateDateColumn({ nullable: false, name: 'updated_at' })
  updatedAt: Date;

  @CreateDateColumn({ nullable: false, name: 'created_at' })
  createdAt: Date;
}
