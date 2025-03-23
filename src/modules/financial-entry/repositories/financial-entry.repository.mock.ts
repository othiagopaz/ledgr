import { Injectable } from '@nestjs/common';
import { FinancialEntry } from '@/domain/financial-entry/financial-entry.entity';

@Injectable()
export class FinancialEntryRepositoryMock {
  private store: FinancialEntry[] = [];

  save(entry: FinancialEntry): FinancialEntry {
    this.store.push(entry);
    console.log('💾 [FakeRepo] Salvo:', entry);
    return entry;
  }

  findById(id: string): FinancialEntry | null {
    return this.store.find((e) => e.id === id) || null;
  }

  findAll(): FinancialEntry[] {
    return this.store;
  }
}
