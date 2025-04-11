import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { CategoryEntity } from '../../Category/infra/category.orm-entity';
import { TransactionEntity } from '../../Transaction/infra/transaction.orm-entity';

@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  description: string;

  @Column({ type: 'date', nullable: false })
  date: Date;

  @Column({ name: 'category_id', nullable: false, type: 'uuid' })
  categoryId: string;

  @Column({ name: 'negotiator_id', nullable: false, type: 'uuid' })
  negotiatorId: string;

  @OneToMany(() => TransactionEntity, (transaction) => transaction.event, {
    eager: true,
  })
  transactions: TransactionEntity[];

  @ManyToOne(() => CategoryEntity, (category) => category.events, {
    eager: false,
  })
  @JoinColumn({ name: 'category_id' })
  category: CategoryEntity;

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
