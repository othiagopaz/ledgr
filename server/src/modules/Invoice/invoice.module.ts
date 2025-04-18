import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceEntity } from './infra/invoice.orm-entity';
import { InvoiceMapper } from './infra/invoice.mapper';
import { InvoiceRepository } from './infra/invoice.repository';
import { INVOICE_REPOSITORY } from './infra/invoice.repository.interface';
import { InvoiceController } from './controllers/invoice.controller';
import { InvoiceService } from './services/invoice.service';
@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity])],
  controllers: [InvoiceController],
  providers: [
    InvoiceMapper,
    InvoiceService,
    {
      provide: INVOICE_REPOSITORY,
      useClass: InvoiceRepository,
    },
  ],
  exports: [INVOICE_REPOSITORY, InvoiceMapper, InvoiceService],
})
export class InvoiceModule {}
