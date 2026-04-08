import { useAppStore } from '../stores/appStore';
import { resolvePeriodDates } from '../utils/dateUtils';
import type { GlobalFilters } from '../types';

/**
 * Read global filter state and resolve dates into API-ready params.
 * Components should always use this hook instead of resolving dates manually.
 */
export function useFilterParams(): GlobalFilters {
  const periodPreset = useAppStore((s) => s.periodPreset);
  const fromDate = useAppStore((s) => s.fromDate);
  const toDate = useAppStore((s) => s.toDate);
  const account = useAppStore((s) => s.account);
  const tags = useAppStore((s) => s.tags);
  const payee = useAppStore((s) => s.payee);

  const { from_date, to_date } = resolvePeriodDates({ periodPreset, fromDate, toDate });

  return { account, from_date, to_date, tags, payee };
}
