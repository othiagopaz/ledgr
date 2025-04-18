import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { CreateInvoiceDto } from '../dtos/create-invoice.dto';
import { Message } from '../../../utils/shared/decorators/message.decorator';
import { InvoiceService } from '../services/invoice.service';
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Post()
  @Message('Invoice created successfully')
  async create(@Body() dto: CreateInvoiceDto) {
    try {
      const invoice = await this.service.create(dto);
      return invoice;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  @Message('Invoices fetched successfully')
  async findAll() {
    const invoices = await this.service.findAll();
    return invoices;
  }

  @Get(':id')
  @Message('Invoice fetched successfully')
  async findById(@Param('id') id: string) {
    const invoice = await this.service.findById(id);
    return invoice;
  }
}
