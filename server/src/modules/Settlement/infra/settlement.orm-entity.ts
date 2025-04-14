import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';
import { TransactionEntity } from '../../Transaction/infra/transaction.orm-entity';

@Entity('settlements')
export class SettlementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TransactionEntity)
  @JoinColumn({ name: 'original_transaction_id' })
  originalTransaction: TransactionEntity;

  @ManyToOne(() => TransactionEntity, { nullable: true })
  @JoinColumn({ name: 'linked_transaction_id' })
  linkedTransaction: TransactionEntity | null;

  @Column({ name: 'negotiator_id' })
  negotiatorId: string;

  @Column('integer')
  amount: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.EXPECTED,
  })
  status: SettlementStatus;

  @Column({
    type: 'enum',
    enum: SettlementDirection,
  })
  direction: SettlementDirection;

  @Column({ name: 'payment_date', nullable: true })
  paymentDate?: Date;

  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @Column({ name: 'notes', nullable: true })
  notes?: string;
}
