import { useAppStore } from '../stores/appStore';

const CURRENCY_LOCALE: Record<string, string> = {
  BRL: 'pt-BR',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CAD: 'en-CA',
  AUD: 'en-AU',
  CHF: 'de-CH',
  CNY: 'zh-CN',
  ARS: 'es-AR',
  MXN: 'es-MX',
  CLP: 'es-CL',
  COP: 'es-CO',
  PEN: 'es-PE',
};

/**
 * Resolve the effective locale.
 * Priority: explicit locale from beancount custom directive > currency-derived > en-US.
 */
export function getLocale(currency: string): string {
  // Check if user set an explicit locale via custom "ledgr-locale" directive
  const explicitLocale = useAppStore.getState().locale;
  if (explicitLocale) return explicitLocale;
  return CURRENCY_LOCALE[currency] || 'en-US';
}

/**
 * Map a numeric amount to the CSS class that colours it by sign:
 * positive → green, negative → red, zero → muted. Per the directional
 * sign-colouring convention in docs/brand/principles.md §4.
 */
export function amountSignClass(value: number): 'positive' | 'negative' | 'amount-zero' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'amount-zero';
}

export function formatAmount(value: number, currency: string): string {
  const locale = getLocale(currency);
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format an ISO date (YYYY-MM-DD) for display, using locale-appropriate order.
 * Returns short format without year (e.g. "03/21" for en-US, "21/03" for pt-BR).
 */
export function formatDateShort(isoDate: string, currency: string): string {
  const locale = getLocale(currency);
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;

  try {
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' });
  } catch {
    return `${m}/${d}`;
  }
}

/**
 * Format a full ISO date for display (with year).
 */
export function formatDateFull(isoDate: string, currency: string): string {
  const locale = getLocale(currency);
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;

  try {
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Get the date placeholder for the locale (e.g. "DD/MM/YYYY" for pt-BR).
 */
export function getDatePlaceholder(currency: string): string {
  const locale = getLocale(currency);
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(2000, 0, 15));

    return parts
      .map((p) => {
        if (p.type === 'day') return 'DD';
        if (p.type === 'month') return 'MM';
        if (p.type === 'year') return 'YYYY';
        return p.value;
      })
      .join('');
  } catch {
    return 'YYYY-MM-DD';
  }
}


export function formatInstallmentBadge(seq: unknown, total: unknown): string {
  const s = Math.round(Number(seq));
  const t = Math.round(Number(total));
  const pad = Math.max(2, String(t).length);
  return `${String(s).padStart(pad, '0')}/${String(t).padStart(pad, '0')}`;
}
