export interface AccountApiResponse {
  success: boolean;
  data: Account[];
  message: string;
}

export enum AccountType {
  CHECKING = "CHECKING",
  SAVINGS = "SAVINGS",
  WALLET = "WALLET",
  INVESTMENT = "INVESTMENT",
  OTHER = "OTHER",
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: {
    value: number;
  };
  isDefault: boolean;
  institution: string | null;
  color: string | null;
  isArchived: boolean;
  userId: string | null;
}
