import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TransactionType } from '../../common/enums/transaction-type.enum';
import { CategoryEntity } from '../Category/category.orm-entity';
import { TransactionEntity } from '../Transaction/transaction.orm-entity';

@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  description: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: false })
  amount: number;

  @Column({ nullable: false })
  installments: number;

  @Column({ type: 'date', nullable: false })
  competenceDate: Date;

  @Column({ type: 'enum', enum: TransactionType, nullable: false })
  type: TransactionType;

  @Column({ name: 'category_id', nullable: false, type: 'uuid' })
  categoryId: string;

  @Column({
    name: 'expected_refund_amount',
    nullable: true,
    type: 'numeric',
    precision: 19,
    scale: 4,
  })
  expectedRefundAmount?: number;

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
