import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';
import { TransactionType } from '../../../utils/shared/enums/transaction-type.enum';
import { EventEntity } from '../../Event/infra/event.orm-entity';

@Entity('categories')
export class CategoryEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ nullable: true, name: 'color' })
  color?: string;

  @Column({ default: false, name: 'is_default' })
  isDefault: boolean;

  @Column({ default: false, name: 'is_archived' })
  isArchived: boolean;

  @Column({ nullable: true, name: 'user_id' })
  userId?: string;

  @ManyToOne(() => CategoryEntity, (category) => category.subcategories, {
    nullable: true,
  })
  @JoinColumn({ name: 'parent_category_id' })
  parentCategory?: CategoryEntity;

  @OneToMany(() => CategoryEntity, (category) => category.parentCategory)
  subcategories?: CategoryEntity[];

  @Column({ name: 'parent_category_id', nullable: true })
  parentCategoryId?: string;

  @OneToMany(() => EventEntity, (entry) => entry.category)
  events?: EventEntity[];

  @UpdateDateColumn({ nullable: false, name: 'updated_at' })
  updatedAt: Date;

  @CreateDateColumn({ nullable: false, name: 'created_at' })
  createdAt: Date;
}
