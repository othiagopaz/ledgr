import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { EventType } from '../../common/enums/event-type.enum';
import { EventEntity } from '../Event/event.orm-entity';

@Entity('categories')
export class CategoryEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: EventType })
  type: EventType;

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
}
