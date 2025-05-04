import { useState } from "react";
import { EventModel } from "../model/event.model";
import { CreateEventDto } from "../model/event.types";

export const useCreateEvent = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const eventModel = new EventModel();

  const createEvent = async (eventData: CreateEventDto) => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess(false);

      const response = await eventModel.createEvent(eventData);

      if (response.success) {
        setSuccess(true);
        return response;
      } else {
        throw new Error(response.message || "Failed to create event");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createEvent,
    isLoading,
    error,
    success,
  };
};
