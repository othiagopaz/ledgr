import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EntryType } from '@/shared/enums/entry-type.enum';
import { OwnershipType } from '@/shared/enums/ownership-type.enum';

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

  @Column({ name: 'category_id', nullable: false })
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
}
