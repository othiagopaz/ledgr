import { Module } from '@nestjs/common';
import { AccountService } from './services/account.service';
import { AccountController } from './controllers/account.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountRepository } from '../../infrastructure/Account/account.repository';
import { AccountMapper } from '../../infrastructure/Account/account.mapper';
import { AccountEntity } from '../../infrastructure/Account/account.orm-entity';
import { IAccountRepository } from '../../infrastructure/Account/account.repository.interface';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [
    AccountService,
    {
      provide: IAccountRepository,
      useClass: AccountRepository,
    },
    AccountMapper,
  ],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
