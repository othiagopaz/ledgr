import { Module } from '@nestjs/common';
import { AccountService } from './services/account.service';
import { AccountController } from './controllers/account.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountRepository } from '../../infrastructure/account/account.repository';
import { AccountMapper } from '../../infrastructure/account/account.mapper';
import { AccountEntity } from '../../infrastructure/account/account.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [AccountService, AccountRepository, AccountMapper],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
