import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateSettlementDto } from '../dtos/create-settlement.dto';
import { Settlement } from '../domain/settlement.entity';
import { UpdateSettlementDto } from '../dtos/update-settlement.dto';
import { ISettlementRepository } from '../infra/settlement.repository.interface';
import { Money } from '../../../utils/shared/types/money';

@Injectable()
export class SettlementService {
  constructor(
    @Inject(ISettlementRepository)
    private readonly settlementRepository: ISettlementRepository,
  ) {}

  async create(dto: CreateSettlementDto): Promise<Settlement> {
    const settlement = new Settlement(
      uuidv4(),
      dto.transactionId,
      dto.negotiatorId,
      new Money(dto.amount),
      dto.dueDate,
      dto.status,
      dto.direction,
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

  async update(id: string, dto: UpdateSettlementDto): Promise<Settlement> {
    const settlement = await this.findById(id);
    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    const updatedSettlement = new Settlement(
      settlement.id,
      dto.transactionId ?? settlement.transactionId,
      dto.negotiatorId ?? settlement.negotiatorId,
      new Money(dto.amount ?? settlement.amount.value),
      dto.dueDate ?? settlement.dueDate,
      dto.status ?? settlement.status,
      dto.direction ?? settlement.direction,
      dto.paymentDate ?? settlement.paymentDate,
      dto.accountId ?? settlement.accountId,
      dto.notes ?? settlement.notes,
    );

    return this.settlementRepository.save(updatedSettlement);
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
