import { api } from "../../../lib/api";
import { CreditCardApiResponse } from "./credit-card.types";

export class CreditCardModel {
  constructor(private client = api) {}

  async fetchAll(): Promise<CreditCardApiResponse> {
    const response = await this.client.get("/credit-cards");
    return response.data as CreditCardApiResponse;
  }
}
