import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CREDIT_CARD_REPOSITORY } from '../infra/credit-card.repository.interface';
import { ICreditCardRepository } from '../infra/credit-card.repository.interface';
import { CreateCreditCardDto } from '../dtos/create-credit-card.dto';
import { CreditCard } from '../domain/credit-card.entity';
import { UpdateCreditCardDto } from '../dtos/update-credit-card.dto';
import { Money } from '../../../utils/shared/types/money';

@Injectable()
export class CreditCardService {
  constructor(
    @Inject(CREDIT_CARD_REPOSITORY)
    private readonly creditCardRepository: ICreditCardRepository,
  ) {}

  async create(dto: CreateCreditCardDto): Promise<CreditCard> {
    const creditCard = CreditCard.create({
      name: dto.name,
      closingDay: dto.closingDay,
      dueDay: dto.dueDay,
      flag: dto.flag,
      isArchived: dto.isArchived,
      limit: dto.limit ?? 0,
      institution: dto.institution ?? '',
      userId: dto.userId,
    });

    return this.creditCardRepository.save(creditCard);
  }

  async findAll(): Promise<CreditCard[]> {
    return this.creditCardRepository.findAll();
  }

  async findById(id: string): Promise<CreditCard | null> {
    return this.creditCardRepository.findById(id);
  }

  async update(id: string, dto: UpdateCreditCardDto): Promise<CreditCard> {
    const creditCard = await this.findById(id);
    if (!creditCard) {
      throw new NotFoundException('Credit card not found');
    }

    creditCard.name = dto.name ?? creditCard.name;
    creditCard.closingDay = dto.closingDay ?? creditCard.closingDay;
    creditCard.dueDay = dto.dueDay ?? creditCard.dueDay;
    creditCard.flag = dto.flag ?? creditCard.flag;
    creditCard.isArchived = dto.isArchived ?? creditCard.isArchived;
    creditCard.limit = dto.limit ? new Money(dto.limit) : creditCard.limit;
    creditCard.institution = dto.institution ?? creditCard.institution;
    creditCard.userId = dto.userId ?? creditCard.userId;

    return this.creditCardRepository.save(creditCard);
  }
}
