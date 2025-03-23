import { EntryType } from '@/shared/enums/entry-type.enum';

export class Category {
  constructor(
    public readonly id: string,
    public name: string,
    public type: EntryType,
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

  update(props: {
    name?: string;
    type?: EntryType;
    color?: string;
    isDefault?: boolean;
    isArchived?: boolean;
    userId?: string;
    parentCategoryId?: string;
  }): void {
    this.name = props.name ?? this.name;
    this.type = props.type ?? this.type;
    this.color = props.color ?? this.color;
    this.isDefault = props.isDefault ?? this.isDefault;
    this.isArchived = props.isArchived ?? this.isArchived;
    this.userId = props.userId ?? this.userId;
    this.parentCategoryId = props.parentCategoryId ?? this.parentCategoryId;
  }
}
