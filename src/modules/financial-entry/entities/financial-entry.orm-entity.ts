import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EntryType } from '@/shared/enums/entry-type.enum';
import { OwnershipType } from '@/shared/enums/ownership-type.enum';
import { CategoryEntity } from '@/modules/category/entities/category.orm-entity';
import { AccountEntity } from '@/modules/account/entities/account.orm-entity';

@Entity('financial_entries')
export class FinancialEntryEntity {
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

  @Column({ type: 'enum', enum: EntryType, nullable: false })
  type: EntryType;

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

  @ManyToOne(() => CategoryEntity, (category) => category.financialEntries, {
    eager: false,
  })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

  @ManyToOne(() => AccountEntity, (account) => account.financialEntries, {
    eager: false,
  })
  @JoinColumn({ name: 'account_id' })
  account: AccountEntity;
}
