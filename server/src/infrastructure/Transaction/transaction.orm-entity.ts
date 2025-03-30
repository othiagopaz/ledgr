import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { EventEntity } from '../Event/event.orm-entity';
import { Ownership } from '../../common/enums/ownership.enum';
import { TransactionType } from '../../common/enums/transaction-type.enum';

@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @ManyToOne(() => EventEntity, (event) => event.transactions, {
    eager: false,
  })
  @JoinColumn({ name: 'event_id' })
  event: EventEntity;

  @Column('numeric', { precision: 19, scale: 4 })
  amount: number;

  @Column({ type: 'date', name: 'due_date' })
  dueDate: Date;

  @Column({ type: 'date', name: 'competence_date' })
  competenceDate: Date;

  @Column({ type: 'enum', enum: TransactionStatus })
  status: TransactionStatus;

  @Column({ type: 'enum', enum: Ownership })
  ownership: Ownership;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'date', name: 'payment_date', nullable: true })
  paymentDate?: Date;

  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @Column({ name: 'credit_card_id', nullable: true })
  creditCardId?: string;

  @Column({ nullable: true })
  notes?: string;

  @Column({
    type: 'timestamp',
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
