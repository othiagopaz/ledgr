import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EntryType } from '@/shared/enums/entry-type.enum';

@Entity('financial_entries')
export class FinancialEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  description: string;

  @Column('decimal')
  amount: number;

  @Column()
  installments: number;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'enum', enum: EntryType })
  type: EntryType;

  @Column()
  categoryId: string;

  @Column({ nullable: true })
  creditCardId?: string;

  @Column({ nullable: true })
  accountId?: string;
}
