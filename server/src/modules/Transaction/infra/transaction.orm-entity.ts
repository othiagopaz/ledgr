import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TransactionStatus } from '../../../utils/shared/enums/transaction-status.enum';
import { EventEntity } from '../../Event/infra/event.orm-entity';
import { Ownership } from '../../../utils/shared/enums/ownership.enum';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import { SettlementEntity } from '../../Settlement/infra/settlement.orm-entity';
import { AccountEntity } from '../../Account/infra/account.orm-entity';
@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EventEntity, { nullable: false })
  @JoinColumn({ name: 'event_id' })
  event: EventEntity;

  @Column({ type: 'integer' })
  amount: number;

  @Column({ type: 'date', name: 'due_date' })
  dueDate: Date;

  @Column({ type: 'date', name: 'competence_date' })
  competenceDate: Date;

  @Column({ type: 'integer', name: 'installment_number' })
  installmentNumber: number;

  @Column({ type: 'enum', enum: TransactionStatus })
  status: TransactionStatus;

  @Column({ type: 'enum', enum: Ownership })
  ownership: Ownership;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'date', name: 'payment_date', nullable: true })
  paymentDate?: Date;

  @ManyToOne(() => AccountEntity, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  @Column({ name: 'credit_card_id', nullable: true })
  creditCardId?: string;

  @Column({ nullable: true })
  notes?: string;

  @OneToMany(
    () => SettlementEntity,
    (settlement) => settlement.originalTransaction,
  )
  originalSettlements: SettlementEntity[];

  @OneToMany(
    () => SettlementEntity,
    (settlement) => settlement.linkedTransaction,
  )
  linkedSettlements: SettlementEntity[];

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
