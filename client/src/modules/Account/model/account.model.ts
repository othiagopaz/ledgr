import { api } from "../../../lib/api";
import { AccountApiResponse } from "./account.types";

export class AccountModel {
  constructor(private client = api) {}

  async fetchAll(): Promise<AccountApiResponse> {
    const response = await this.client.get("/accounts");
    return response.data as AccountApiResponse;
  }
}
