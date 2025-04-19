import { Transference } from '../domain/transference.entity';
import { IRepository } from '../../../utils/shared/infra/repository.interface';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ITransferenceRepository extends IRepository<Transference> {}

export const TRANSFERENCE_REPOSITORY = Symbol('TRANSFERENCE_REPOSITORY');
