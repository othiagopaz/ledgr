import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateSettlementDto } from '../dtos/create-settlement.dto';
import { Settlement } from '../domain/settlement.entity';
import { ISettlementRepository } from '../infra/settlement.repository.interface';
import { Money } from '../../../utils/shared/types/money';
import { ITransactionRepository } from '../../Transaction/infra/transaction.repository.interface';
import { SETTLEMENT_REPOSITORY } from '../infra/settlement.repository.interface';
import { TRANSACTION_REPOSITORY } from '../../Transaction/infra/transaction.repository.interface';
@Injectable()
export class SettlementService {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY)
    private readonly settlementRepository: ISettlementRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly transactionRepository: ITransactionRepository,
  ) {}

  async create(dto: CreateSettlementDto): Promise<Settlement> {
    const originalTransaction = await this.transactionRepository.findById(
      dto.originalTransactionId,
    );

    if (!originalTransaction) {
      throw new NotFoundException('Original transaction not found');
    }

    const linkedTransaction = dto.linkedTransactionId
      ? await this.transactionRepository.findById(dto.linkedTransactionId)
      : undefined;

    const settlement = new Settlement(
      uuidv4(),
      originalTransaction,
      dto.negotiatorId,
      new Money(dto.amount),
      dto.dueDate,
      dto.status,
      dto.direction,
      linkedTransaction ?? undefined,
      dto.paymentDate,
      dto.accountId,
      dto.notes,
    );

    return this.settlementRepository.save(settlement);
  }

  async findAll(): Promise<Settlement[]> {
    return this.settlementRepository.findAll();
  }

  async findById(id: string): Promise<Settlement | null> {
    return this.settlementRepository.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    const settlement = await this.findById(id);
    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    try {
      await this.settlementRepository.delete(id);
      return true;
    } catch (error) {
      console.error('Error deleting settlement:', error);
      throw new InternalServerErrorException('Failed to delete settlement');
    }
  }
}
