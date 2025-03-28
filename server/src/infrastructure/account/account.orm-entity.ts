import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { AccountType } from '../../common/enums/account-type.enum';
import { EventEntity } from '../Event/event.orm-entity';

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

  @OneToMany(() => EventEntity, (entry) => entry.account)
  events?: EventEntity[];
}
