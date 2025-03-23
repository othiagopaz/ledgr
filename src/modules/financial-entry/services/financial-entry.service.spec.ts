import { Test, TestingModule } from '@nestjs/testing';
import { FinancialEntryService } from './financial-entry.service';

describe('FinancialEntryService', () => {
  let service: FinancialEntryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinancialEntryService],
    }).compile();

    service = module.get<FinancialEntryService>(FinancialEntryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
