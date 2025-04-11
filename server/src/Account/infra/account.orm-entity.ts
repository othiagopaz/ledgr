import { Column, Entity, PrimaryColumn } from 'typeorm';
import { AccountType } from '../../shared/enums/account-type.enum';

@Entity('accounts')
export class AccountEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'initial_balance' })
  initialBalance: number;

  @Column({ nullable: true })
  institution?: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ default: false, name: 'is_archived' })
  isArchived: boolean;

  @Column({ nullable: true, name: 'user_id' })
  userId?: string;

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
