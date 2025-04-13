import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { SettlementStatus } from '../../../utils/shared/enums/settlement-status.enum';
import { SettlementDirection } from '../../../utils/shared/enums/settlement.direction.enum';

@Entity('settlements')
export class SettlementOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @Column()
  negotiatorId: string;

  @Column('integer')
  amount: number;

  @Column()
  dueDate: Date;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.EXPECTED,
  })
  status: SettlementStatus;

  @Column({
    type: 'enum',
    enum: SettlementDirection,
  })
  direction: SettlementDirection;

  @Column({ nullable: true })
  paymentDate?: Date;

  @Column({ nullable: true })
  accountId?: string;

  @Column({ nullable: true })
  notes?: string;
}
