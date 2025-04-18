import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateAccountDto } from '../dtos/create-account.dto';
import { Account } from '../domain/account.entity';
import { UpdateAccountDto } from '../dtos/update-account.dto';
import { IAccountRepository } from '../infra/account.repository.interface';
import { Money } from '../../../utils/shared/types/money';
import { ACCOUNT_REPOSITORY } from '../infra/account.repository';
@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    const account = new Account(
      uuidv4(),
      dto.name,
      dto.type,
      new Money(dto.initialBalance),
      dto.isDefault,
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

    if (dto.initialBalance) {
      account.initialBalance = new Money(dto.initialBalance);
    }

    const updatedAccount = new Account(
      account.id,
      dto.name ?? account.name,
      dto.type ?? account.type,
      account.initialBalance,
      dto.isDefault ?? account.isDefault,
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
