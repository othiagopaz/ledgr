import { Entity, ManyToOne, PrimaryGeneratedColumn, JoinColumn } from 'typeorm';
import { CategoryEntity } from './category.orm-entity';

@Entity('category_relations')
export class CategoryRelationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CategoryEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent: CategoryEntity;

  @ManyToOne(() => CategoryEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'child_id' })
  child: CategoryEntity;
}
