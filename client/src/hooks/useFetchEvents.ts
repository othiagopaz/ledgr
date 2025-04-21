import { useState, useEffect } from "react";
import { getEvents, Event } from "@/services/Event"; // Removed unused PaginatedData, ApiResponse
// import { getStartAndEndOfMonth, getStartAndEndOfYear } from "@/utils/dateUtils"; // Incorrect path
import { format } from "date-fns"; // Import format from date-fns

// Helper date functions (move to utils/dateUtils.ts later)
// Ensure date-fns is installed: npm install date-fns
// or yarn add date-fns

function getStartAndEndOfMonth(year: number, monthIndex: number) {
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0); // Day 0 of next month is last day of current month
  return {
    startOfMonth: format(startDate, "yyyy-MM-dd"), // Format as YYYY-MM-DD
    endOfMonth: format(endDate, "yyyy-MM-dd"), // Format as YYYY-MM-DD
  };
}

function getStartAndEndOfYear(year: number) {
  const startDate = new Date(year, 0, 1); // January 1st
  const endDate = new Date(year, 11, 31); // December 31st
  return {
    startOfYear: format(startDate, "yyyy-MM-dd"), // Format as YYYY-MM-DD
    endOfYear: format(endDate, "yyyy-MM-dd"), // Format as YYYY-MM-DD
  };
}

// Main hook implementation
interface UseFetchEventsParams {
  selectedYear: number;
  selectedMonthIndex: number | null; // Can be null for "All Months"
  currentPage: number;
  limit?: number; // Optional limit, defaults to 50
  // Add other filters here later as needed (accountId, categoryId, etc.)
}

export function useFetchEvents({
  selectedYear,
  selectedMonthIndex,
  currentPage,
  limit = 50, // Default limit
}: UseFetchEventsParams) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);

  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true);
      setError(null);
      setEvents([]); // Clear previous events on new fetch

      let dateRange;
      if (selectedMonthIndex !== null) {
        const { startOfMonth, endOfMonth } = getStartAndEndOfMonth(
          selectedYear,
          selectedMonthIndex
        );
        dateRange = { from: startOfMonth, to: endOfMonth };
      } else {
        // "All Months" selected, fetch for the whole year
        const { startOfYear, endOfYear } = getStartAndEndOfYear(selectedYear);
        dateRange = { from: startOfYear, to: endOfYear };
      }

      try {
        const response = await getEvents({
          page: currentPage,
          limit: limit,
          from: dateRange.from,
          to: dateRange.to,
          // Pass other filters here when added
        });

        // --- DEBUG LOG ---
        console.log("API Response Data:", response);
        // --- END DEBUG LOG ---

        if (response.success && response.data) {
          setEvents(response.data.data);
          const calculatedTotalPages = Math.ceil(response.data.total / limit);
          setTotalPages(calculatedTotalPages);
        } else {
          // Handle API returning success: false
          setError(response.message || "Failed to fetch events.");
          setEvents([]);
          setTotalPages(0);
        }
      } catch (err) {
        console.error("Error fetching events:", err);
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred.";
        setError(message);
        setEvents([]);
        setTotalPages(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, [selectedYear, selectedMonthIndex, currentPage, limit]); // Re-run effect when these change

  // Note: We don't return setCurrentPage directly from here
  // because the currentPage state should be managed by the component using the hook.
  return { events, isLoading, error, totalPages };
}
