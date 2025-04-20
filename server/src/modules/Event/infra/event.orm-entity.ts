import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { CategoryEntity } from '../../Category/infra/category.orm-entity';
import { TransactionEntity } from '../../Transaction/infra/transaction.orm-entity';
import { TransferenceEntity } from '../../Transference/infra/transference.orm-entity';

@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  description: string;

  @Column({ type: 'date', nullable: false })
  date: Date;

  @Column({ name: 'negotiator_id', nullable: true, type: 'uuid' })
  negotiatorId?: string;

  @ManyToOne(() => CategoryEntity, { nullable: false })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.event, {
    eager: true,
  })
  transactions: TransactionEntity[];

  @OneToMany(
    () => TransferenceEntity,
    (transference) => transference.sourceEvent,
  )
  sourceTransferences: TransferenceEntity[];

  @OneToMany(
    () => TransferenceEntity,
    (transference) => transference.destinationEvent,
  )
  destinationTransferences: TransferenceEntity[];

  @UpdateDateColumn({ nullable: false, name: 'updated_at' })
  updatedAt: Date;

  @CreateDateColumn({ nullable: false, name: 'created_at' })
  createdAt: Date;
}
