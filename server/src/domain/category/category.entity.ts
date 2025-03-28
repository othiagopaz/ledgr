import { EventType } from '../../common/enums/event-type.enum';

export class Category {
  constructor(
    public readonly id: string,
    public name: string,
    public type: EventType,
    public color?: string,
    public isDefault?: boolean,
    public isArchived?: boolean,
    public userId?: string,
    public parentCategoryId?: string,
  ) {}

  archive() {
    this.isArchived = true;
  }

  unarchive() {
    this.isArchived = false;
  }
}
