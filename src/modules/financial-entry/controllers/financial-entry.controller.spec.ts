import { Test, TestingModule } from '@nestjs/testing';
import { FinancialEntryController } from './financial-entry.controller';

describe('FinancialEntryController', () => {
  let controller: FinancialEntryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialEntryController],
    }).compile();

    controller = module.get<FinancialEntryController>(FinancialEntryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
