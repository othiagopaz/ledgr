import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AccountEntity } from '../../Account/infra/account.orm-entity';
import { EventEntity } from '../../Event/infra/event.orm-entity';

@Entity('transferences')
export class TransferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  description: string;

  @Column({ type: 'integer', nullable: false })
  amount: number;

  @Column({ type: 'date', nullable: false })
  date: Date;

  @ManyToOne(() => AccountEntity, { nullable: false })
  @JoinColumn({ name: 'source_account_id' })
  sourceAccount: AccountEntity;

  @ManyToOne(() => AccountEntity, { nullable: false })
  @JoinColumn({ name: 'destination_account_id' })
  destinationAccount: AccountEntity;

  @ManyToOne(() => EventEntity, { nullable: false })
  @JoinColumn({ name: 'source_event_id' })
  sourceEvent: EventEntity;

  @ManyToOne(() => EventEntity, { nullable: false })
  @JoinColumn({ name: 'destination_event_id' })
  destinationEvent: EventEntity;

  @Column({ nullable: true })
  notes?: string;

  @UpdateDateColumn({ nullable: false, name: 'updated_at' })
  updatedAt: Date;

  @CreateDateColumn({ nullable: false, name: 'created_at' })
  createdAt: Date;
}
