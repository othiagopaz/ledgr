import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { AccountService } from '../services/account.service';
import { CreateAccountDto } from '../dtos/create-account.dto';
import { UpdateAccountDto } from '../dtos/update-account.dto';
import { Account } from '../domain/account.entity';
import { Message } from '../../shared/decorators/message.decorator';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @Message('Account created successfully')
  async create(@Body() dto: CreateAccountDto): Promise<Account> {
    return this.accountService.create(dto);
  }

  @Get()
  @Message('Accounts fetched successfully')
  async findAll(): Promise<Account[]> {
    return this.accountService.findAll();
  }

  @Get(':id')
  @Message('Account fetched successfully')
  async findById(@Param('id') id: string): Promise<Account | null> {
    return this.accountService.findById(id);
  }

  @Put(':id')
  @Message('Account updated successfully')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<Account> {
    return this.accountService.update(id, dto);
  }

  @Put(':id/archive')
  @Message('Account archived successfully')
  async archive(@Param('id') id: string): Promise<Account> {
    return this.accountService.archive(id);
  }

  @Put(':id/unarchive')
  @Message('Account unarchived successfully')
  async unarchive(@Param('id') id: string): Promise<Account> {
    return this.accountService.unarchive(id);
  }
}
