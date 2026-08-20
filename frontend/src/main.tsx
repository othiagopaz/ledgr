import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, keepPreviousData } from "@tanstack/react-query";
import App from "./App";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // The ledger only changes when this app writes to it (mutations already
      // invalidate the affected keys) or when the file is edited outside —
      // which the backend picks up via its mtime check on the next read. So
      // remounting a view is not a reason to refetch: without a staleTime,
      // every tab switch re-fetched data React Query already had in cache.
      staleTime: 30_000,
      // Keep the previous page's data on screen while a new filter window
      // loads, instead of dropping to a "Loading..." blank. Charts and
      // statements stay readable and the change reads as fast even when the
      // request is not instant.
      placeholderData: keepPreviousData,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
