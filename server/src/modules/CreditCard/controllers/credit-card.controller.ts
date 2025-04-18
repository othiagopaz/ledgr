import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { CreditCardService } from '../services/credit-card.service';
import { CreateCreditCardDto } from '../dtos/create-credit-card.dto';
import { CreditCard } from '../domain/credit-card.entity';
import { Message } from '../../../utils/shared/decorators/message.decorator';

@Controller('credit-cards')
export class CreditCardController {
  constructor(private readonly creditCardService: CreditCardService) {}

  @Post()
  @Message('Credit card created successfully')
  async create(@Body() dto: CreateCreditCardDto): Promise<CreditCard> {
    try {
      return this.creditCardService.create(dto);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  @Message('Credit cards fetched successfully')
  async findAll(): Promise<CreditCard[]> {
    return this.creditCardService.findAll();
  }

  @Get(':id')
  @Message('Credit card fetched successfully')
  async findById(@Param('id') id: string): Promise<CreditCard | null> {
    return this.creditCardService.findById(id);
  }
}
