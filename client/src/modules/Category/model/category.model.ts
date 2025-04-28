import { api } from "../../../../../client/src/lib/api";
import { CategoryApiResponse } from "./category.types";

export class CategoryModel {
  constructor(private client = api) {}

  async fetchAll(): Promise<CategoryApiResponse> {
    const response = await this.client.get("/categories");
    return response.data as CategoryApiResponse;
  }
}
