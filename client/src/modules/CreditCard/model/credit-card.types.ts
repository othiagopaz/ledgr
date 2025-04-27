export interface CreditCardApiResponse {
  success: boolean;
  data: CreditCard[];
  message: string;
}

export enum CreditCardFlag {
  VISA = "VISA",
  MASTERCARD = "MASTERCARD",
  ELO = "ELO",
  AMERICAN_EXPRESS = "AMERICAN_EXPRESS",
  OTHER = "OTHER",
}

export interface CreditCard {
  id: string;
  name: string;
  estimatedDaysBeforeDue: number;
  dueDate: number;
  flag: CreditCardFlag;
  isArchived: boolean;
  limit: {
    value: number;
  };
  institution: string | null;
  userId: string | null;
}
