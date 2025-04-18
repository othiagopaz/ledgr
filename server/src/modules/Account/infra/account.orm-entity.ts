import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AccountType } from '../../../utils/shared/enums/account-type.enum';
import { TransactionEntity } from '../../Transaction/infra/transaction.orm-entity';

@Entity('accounts')
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ type: 'integer', name: 'initial_balance' })
  initialBalance: number;

  @Column({ default: false, name: 'is_default' })
  isDefault: boolean;

  @Column({ nullable: true })
  institution?: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ default: false, name: 'is_archived' })
  isArchived: boolean;

  @Column({ nullable: true, name: 'user_id' })
  userId?: string;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.account)
  transactions: TransactionEntity[];

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
