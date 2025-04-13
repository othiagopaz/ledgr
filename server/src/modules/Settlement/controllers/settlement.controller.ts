import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { SettlementService } from '../services/settlement.service';
import { CreateSettlementDto } from '../dtos/create-settlement.dto';
import { Settlement } from '../domain/settlement.entity';

@Controller('settlements')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post()
  async create(
    @Body() createSettlementDto: CreateSettlementDto,
  ): Promise<Settlement> {
    return this.settlementService.create(createSettlementDto);
  }

  @Get()
  async findAll(): Promise<Settlement[]> {
    return this.settlementService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Settlement | undefined> {
    return this.settlementService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateData: Partial<Settlement>,
  ): Promise<Settlement | undefined> {
    return this.settlementService.update(id, updateData);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<boolean> {
    return this.settlementService.remove(id);
  }
}
