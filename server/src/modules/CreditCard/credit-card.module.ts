import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditCardEntity } from './infra/credit-card.orm-entity';
import { CreditCardMapper } from './infra/credit-card.mapper';
import { CreditCardRepository } from './infra/credit-card.repository';
import { CREDIT_CARD_REPOSITORY } from './infra/credit-card.repository.interface';
import { CreditCardController } from './controllers/credit-card.controller';
import { CreditCardService } from './services/credit-card.service';
@Module({
  imports: [TypeOrmModule.forFeature([CreditCardEntity])],
  controllers: [CreditCardController],
  providers: [
    CreditCardMapper,
    CreditCardService,
    {
      provide: CREDIT_CARD_REPOSITORY,
      useClass: CreditCardRepository,
    },
  ],
  exports: [CREDIT_CARD_REPOSITORY, CreditCardMapper, CreditCardService],
})
export class CreditCardModule {}
