import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { CreditCardFlag } from '../../../utils/shared/enums/credit-card-flags.enum';

@Entity('credit_cards')
export class CreditCardEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: false, name: 'closing_day' })
  closingDay: number;

  @Column({ nullable: false, name: 'due_day' })
  dueDay: number;

  @Column({ nullable: false, name: 'flag' })
  flag: CreditCardFlag;

  @Column({ nullable: false, name: 'is_archived' })
  isArchived: boolean;

  @Column({ nullable: true, name: 'limit', type: 'integer' })
  limit: number;

  @Column({ nullable: true, name: 'institution' })
  institution: string;

  @Column({ nullable: true, name: 'user_id' })
  userId: string;
}
