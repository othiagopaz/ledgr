import { useState } from "react";
import { createEvent, CreateEventPayload } from "@/modules/api";
import { toast } from "sonner";

interface UseCreateEventOptions {
  onSuccess?: () => void; // Optional callback on success
  onError?: (error: Error) => void; // Optional callback on error
}

export function useCreateEvent(options?: UseCreateEventOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mutate = async (payload: CreateEventPayload) => {
    setIsSubmitting(true);
    try {
      console.log(
        "Submitting Payload (from hook):",
        JSON.stringify(payload, null, 2)
      );
      const response = await createEvent(payload);
      console.log("API Response (from hook):", response);
      toast.success(response.message || "Evento criado com sucesso!");

      // Call onSuccess callback if provided
      options?.onSuccess?.();

      return response; // Return response for potential further actions
    } catch (error) {
      console.error("Erro ao criar evento (from hook):", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Ocorreu um erro desconhecido.";
      toast.error(`Falha ao criar evento: ${errorMessage}`);

      // Call onError callback if provided
      options?.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );

      // Rethrow or return error indicator if needed by caller
      // throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    mutate,
    isSubmitting,
  };
}
