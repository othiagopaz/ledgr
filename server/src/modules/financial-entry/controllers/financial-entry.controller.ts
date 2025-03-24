import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FinancialEntryService } from '../services/financial-entry.service';
import { CreateFinancialEntryDto } from '../dtos/create-financial-entry.dto';
import { Message } from '../../../shared/decorators/message.decorator';

@Controller('financial-entries')
export class FinancialEntryController {
  constructor(private readonly service: FinancialEntryService) {}

  @Post()
  @Message('Financial entry created successfully')
  async create(@Body() dto: CreateFinancialEntryDto) {
    const financialEntry = await this.service.create(dto);
    return { id: financialEntry.id };
  }

  @Get()
  @Message('Financial entries fetched successfully')
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Message('Financial entry fetched successfully')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
