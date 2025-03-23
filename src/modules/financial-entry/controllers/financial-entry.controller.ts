import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FinancialEntryService } from '../services/financial-entry.service';
import { CreateFinancialEntryDto } from '../dto/create-financial-entry.dto';

@Controller('financial-entries')
export class FinancialEntryController {
  constructor(private readonly service: FinancialEntryService) {}

  @Post()
  async create(@Body() dto: CreateFinancialEntryDto) {
    const financialEntry = await this.service.create(dto);
    return financialEntry.id;
  }

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
