import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
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

  @UpdateDateColumn({ nullable: false, name: 'updated_at' })
  updatedAt: Date;

  @CreateDateColumn({ nullable: false, name: 'created_at' })
  createdAt: Date;
}
