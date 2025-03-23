import { Module } from '@nestjs/common';
import { InstallmentService } from './services/installment.service';
import { InstallmentController } from './controller/installment.controller';
import { InstallmentRepository } from './repositories/installment.repository';
import { InstallmentMapper } from './mappers/installment.mapper';
import { InstallmentEntity } from './entities/installment.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([InstallmentEntity])],
  providers: [InstallmentService, InstallmentRepository, InstallmentMapper],
  controllers: [InstallmentController],
  exports: [InstallmentService],
})
export class InstallmentModule {}
