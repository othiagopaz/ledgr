import { Module } from '@nestjs/common';
import { InstallmentService } from './services/installment.service';
import { InstallmentController } from './controllers/installment.controller';
import { InstallmentRepository } from '../../infrastructure/installment/installment.repository';
import { InstallmentMapper } from '../../infrastructure/installment/installment.mapper';
import { InstallmentEntity } from '../../infrastructure/installment/installment.orm-entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([InstallmentEntity])],
  providers: [InstallmentService, InstallmentRepository, InstallmentMapper],
  controllers: [InstallmentController],
  exports: [InstallmentService],
})
export class InstallmentModule {}
