import { api } from "@/lib/api";
import { EventApiResponse } from "@/modules/Events/model/event.types";

export class EventModel {
  constructor(private client = api) {}

  async fetchAll(params: {
    page: number;
    limit: number;
    from: string;
    to: string;
  }): Promise<EventApiResponse> {
    const response = await this.client.get("/events", { params });
    return response.data as EventApiResponse;
  }
}
