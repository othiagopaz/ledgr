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
