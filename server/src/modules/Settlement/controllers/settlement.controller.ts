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
import { UpdateSettlementDto } from '../dtos/update-settlement.dto';
import { Message } from '../../../utils/shared/decorators/message.decorator';

@Controller('settlements')
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post()
  @Message('Settlement created successfully')
  async create(
    @Body() createSettlementDto: CreateSettlementDto,
  ): Promise<Settlement> {
    return this.settlementService.create(createSettlementDto);
  }

  @Get()
  @Message('Settlements fetched successfully')
  async findAll(): Promise<Settlement[]> {
    return this.settlementService.findAll();
  }

  @Get(':id')
  @Message('Settlement fetched successfully')
  async findById(@Param('id') id: string): Promise<Settlement | null> {
    return this.settlementService.findById(id);
  }

  @Put(':id')
  @Message('Settlement updated successfully')
  async update(
    @Param('id') id: string,
    @Body() updateData: UpdateSettlementDto,
  ): Promise<Settlement | null> {
    return this.settlementService.update(id, updateData);
  }

  @Delete(':id')
  @Message('Settlement deleted successfully')
  async remove(@Param('id') id: string): Promise<void> {
    await this.settlementService.remove(id);
  }
}
