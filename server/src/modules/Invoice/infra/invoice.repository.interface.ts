import { IRepository } from '../../../utils/shared/infra/repository.interface';
import { Invoice } from '../domain/invoice.entity';

export type IInvoiceRepository = IRepository<Invoice>;

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
