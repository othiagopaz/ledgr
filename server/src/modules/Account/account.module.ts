import { Module } from '@nestjs/common';
import { AccountService } from './services/account.service';
import { AccountController } from './controllers/account.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountRepository } from './infra/account.repository';
import { AccountMapper } from './infra/account.mapper';
import { AccountEntity } from './infra/account.orm-entity';
import { ACCOUNT_REPOSITORY } from './infra/account.repository.interface';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [
    AccountService,
    {
      provide: ACCOUNT_REPOSITORY,
      useClass: AccountRepository,
    },
    AccountMapper,
  ],
  controllers: [AccountController],
  exports: [AccountService, ACCOUNT_REPOSITORY, AccountMapper],
})
export class AccountModule {}
