import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InstallmentStatus } from '../../../shared/enums/installment-status.enum';

@Entity('installments')
export class InstallmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'financial_entry_id', type: 'uuid' })
  financialEntryId: string;

  @Column('decimal')
  amount: number;

  @Column({ type: 'timestamp', name: 'due_date' })
  dueDate: Date;

  @Column({ type: 'timestamp', name: 'competence_date' })
  competenceDate: Date;

  @Column({ type: 'enum', enum: InstallmentStatus })
  status: InstallmentStatus;

  @Column({ type: 'timestamp', name: 'payment_date', nullable: true })
  paymentDate?: Date;

  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @Column({ name: 'credit_card_id', nullable: true })
  creditCardId?: string;

  @Column({ name: 'is_refundable', nullable: true })
  isRefundable?: boolean;

  @Column({ name: 'is_shared', nullable: true })
  isShared?: boolean;

  @Column({ nullable: true })
  notes?: string;
}
