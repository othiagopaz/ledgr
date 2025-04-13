import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';

@Entity('settlements')
export class SettlementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @Column({ name: 'negotiator_id' })
  negotiatorId: string;

  @Column('integer')
  amount: number;

  @Column({ name: 'due_date' })
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
