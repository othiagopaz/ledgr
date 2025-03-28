import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateAccountDto } from '../dtos/create-account.dto';
import { Account } from '../../../domain/Account/account.entity';
import { UpdateAccountDto } from '../dtos/update-account.dto';
import { IAccountRepository } from '../../../infrastructure/Account/account.repository.interface';

@Injectable()
export class AccountService {
  constructor(
    @Inject(IAccountRepository)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    const account = new Account(
      uuidv4(),
      dto.name,
      dto.type,
      dto.initialBalance,
      dto.institution,
      dto.color,
      dto.isArchived ?? false,
      dto.userId,
    );

    return this.accountRepository.save(account);
  }

  async findAll(): Promise<Account[]> {
    return this.accountRepository.findAll();
  }

  async findById(id: string): Promise<Account | null> {
    return this.accountRepository.findById(id);
  }

  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    const account = await this.findById(id);
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const updatedAccount = new Account(
      account.id,
      dto.name ?? account.name,
      dto.type ?? account.type,
      dto.initialBalance ?? account.initialBalance,
      dto.institution ?? account.institution,
      dto.color ?? account.color,
      dto.isArchived ?? account.isArchived,
      dto.userId ?? account.userId,
    );

    return this.accountRepository.save(updatedAccount);
  }

  async archive(id: string): Promise<Account> {
    const account = await this.findById(id);
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    account.archive();
    return this.accountRepository.save(account);
  }

  async unarchive(id: string): Promise<Account> {
    const account = await this.findById(id);
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    account.unarchive();
    return this.accountRepository.save(account);
  }
}
