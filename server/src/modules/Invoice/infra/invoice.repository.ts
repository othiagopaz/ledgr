import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BaseRepository } from '../../../utils/shared/infra/base.repository';
import { IInvoiceRepository } from './invoice.repository.interface';
import { InvoiceEntity } from './invoice.orm-entity';
import { Invoice } from '../domain/invoice.entity';
import { InvoiceMapper } from './invoice.mapper';

@Injectable()
export class InvoiceRepository
  extends BaseRepository<Invoice, InvoiceEntity>
  implements IInvoiceRepository
{
  constructor(
    @InjectRepository(InvoiceEntity)
    repo: Repository<InvoiceEntity>,
    mapper: InvoiceMapper,
  ) {
    super(repo, mapper);
  }

  protected getRelations(): string[] {
    return ['creditCard'];
  }
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
