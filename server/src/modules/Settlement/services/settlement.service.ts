import { Injectable } from '@nestjs/common';
import { Settlement } from '../domain/settlement.entity';
import { CreateSettlementDto } from '../dtos/create-settlement.dto';
import { Money } from '../../../shared/domain/money';

@Injectable()
export class SettlementService {
  private settlements: Settlement[] = [];

  async create(createSettlementDto: CreateSettlementDto): Promise<Settlement> {
    const settlement = new Settlement({
      id: Math.random().toString(36).substr(2, 9),
      ...createSettlementDto,
      amount: new Money(createSettlementDto.amount),
    });

    this.settlements.push(settlement);
    return settlement;
  }

  async findAll(): Promise<Settlement[]> {
    return this.settlements;
  }

  async findOne(id: string): Promise<Settlement | undefined> {
    return this.settlements.find((settlement) => settlement.id === id);
  }

  async update(
    id: string,
    updateData: Partial<Settlement>,
  ): Promise<Settlement | undefined> {
    const index = this.settlements.findIndex(
      (settlement) => settlement.id === id,
    );
    if (index === -1) return undefined;

    const updatedSettlement = {
      ...this.settlements[index],
      ...updateData,
    };

    this.settlements[index] = updatedSettlement;
    return updatedSettlement;
  }

  async remove(id: string): Promise<boolean> {
    const index = this.settlements.findIndex(
      (settlement) => settlement.id === id,
    );
    if (index === -1) return false;

    this.settlements.splice(index, 1);
    return true;
  }
}
