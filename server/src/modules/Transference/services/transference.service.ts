import { Injectable, Inject } from '@nestjs/common';
import { Transference } from '../domain/transference.entity';
import { TRANSFERENCE_REPOSITORY } from '../infra/transference.repository.interface';
import { ITransferenceRepository } from '../infra/transference.repository.interface';
import { Money } from '../../../utils/shared/types/money';
import { PlainDate } from '../../../utils/shared/types/plain-date';
import { CreateTransferenceDto } from '../dtos/create-transference.dto';
import { UpdateTransferenceDto } from '../dtos/update-transference.dto';
@Injectable()
export class TransferenceService {
  constructor(
    @Inject(TRANSFERENCE_REPOSITORY)
    private readonly transferenceRepository: ITransferenceRepository,
  ) {}

  async create(dto: CreateTransferenceDto): Promise<Transference> {
    const transference = Transference.create({
      description: dto.description,
      amount: new Money(dto.amount),
      date: PlainDate.fromString(dto.date),
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      sourceEventId: dto.sourceEventId,
      destinationEventId: dto.destinationEventId,
      notes: dto.notes,
    });

    return this.transferenceRepository.save(transference);
  }

  async update(id: string, dto: UpdateTransferenceDto): Promise<Transference> {
    const transference = await this.transferenceRepository.findById(id);
    if (!transference) {
      throw new Error('Transference not found');
    }

    const updatedTransference = Transference.create({
      description: dto.description ?? transference.description,
      amount: new Money(dto.amount ?? transference.amount.value),
      date: PlainDate.fromString(dto.date ?? transference.date.toString()),
      sourceAccountId: dto.sourceAccountId ?? transference.sourceAccountId,
      destinationAccountId:
        dto.destinationAccountId ?? transference.destinationAccountId,
      sourceEventId: dto.sourceEventId ?? transference.sourceEventId,
      destinationEventId:
        dto.destinationEventId ?? transference.destinationEventId,
      notes: dto.notes ?? transference.notes,
    });

    return this.transferenceRepository.save(updatedTransference);
  }

  async delete(id: string): Promise<void> {
    const transference = await this.transferenceRepository.findById(id);
    if (!transference) {
      throw new Error('Transference not found');
    }

    await this.transferenceRepository.delete(id);
  }

  async findById(id: string): Promise<Transference> {
    const transference = await this.transferenceRepository.findById(id);
    if (!transference) {
      throw new Error('Transference not found');
    }
    return transference;
  }

  async findAll(): Promise<Transference[]> {
    return this.transferenceRepository.findAll();
  }
}
