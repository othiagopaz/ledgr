import { Module } from '@nestjs/common';
import { AccountService } from './services/account.service';
import { AccountController } from './controllers/account.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountRepository } from './repositories/account.repository';
import { AccountMapper } from './mappers/account.mapper';
import { AccountEntity } from './entities/account.orm-entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity])],
  providers: [AccountService, AccountRepository, AccountMapper],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
