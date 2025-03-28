import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EventType } from '../../common/enums/event-type.enum';
import { OwnershipType } from '../../common/enums/ownership-type.enum';
import { CategoryEntity } from '../Category/category.orm-entity';
import { AccountEntity } from '../Account/account.orm-entity';

@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  description: string;

  @Column({ type: 'decimal', nullable: false })
  amount: number;

  @Column({ nullable: false })
  installments: number;

  @Column({ type: 'timestamp', nullable: false })
  date: Date;

  @Column({ type: 'enum', enum: EventType, nullable: false })
  type: EventType;

  @Column({ name: 'category_id', nullable: false, type: 'uuid' })
  categoryId: string;

  @Column({ name: 'credit_card_id', nullable: true })
  creditCardId?: string;

  @Column({ name: 'account_id', nullable: true })
  accountId?: string;

  @Column({
    type: 'enum',
    enum: OwnershipType,
    name: 'ownership_type',
    nullable: true,
  })
  ownershipType?: OwnershipType;

  @Column({ name: 'expected_refund_amount', nullable: true })
  expectedRefundAmount?: number;

  @Column({ name: 'refund_installments', nullable: true })
  refundInstallments?: number;

  @Column({ type: 'jsonb', name: 'refund_installment_dates', nullable: true })
  refundInstallmentDates?: Date[];

  @Column({ name: 'is_off_balance', nullable: true })
  isOffBalance?: boolean;

  @ManyToOne(() => CategoryEntity, (category) => category.events, {
    eager: false,
  })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

  @ManyToOne(() => AccountEntity, (account) => account.events, {
    eager: false,
  })
  @JoinColumn({ name: 'account_id' })
  account: AccountEntity;
}
