import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../stores/appStore';
import { fetchAccountNames, fetchTags, fetchPayees } from '../api/client';
import { resolvePeriodDates } from '../utils/dateUtils';
import { CalendarIcon, AccountIcon, TagIcon, UserIcon, XIcon } from './icons';
import type { PeriodPreset } from '../types';

// ---- Period presets ----

const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-30-days', label: 'Last 30 days' },
  { value: 'last-12-months', label: 'Last 12 months' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all-time', label: 'All time' },
];

// ---- Shared dropdown wrapper ----

interface DropdownProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Dropdown({ open, onClose, children }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className="filter-dropdown">
      {children}
    </div>
  );
}

// ---- Period dropdown ----

function PeriodDropdown({ open, onClose }: { open: boolean; onClose: () => void }) {
  const periodPreset = useAppStore((s) => s.periodPreset);
  const fromDate = useAppStore((s) => s.fromDate);
  const toDate = useAppStore((s) => s.toDate);
  const setFilter = useAppStore((s) => s.setFilter);
  const [customFrom, setCustomFrom] = useState(fromDate || '');
  const [customTo, setCustomTo] = useState(toDate || '');

  function selectPreset(preset: PeriodPreset) {
    if (preset === 'all-time') {
      setFilter({ periodPreset: null, fromDate: null, toDate: null });
    } else {
      setFilter({ periodPreset: preset });
    }
    onClose();
  }

  function applyCustom() {
    if (customFrom || customTo) {
      setFilter({
        periodPreset: null,
        fromDate: customFrom || null,
        toDate: customTo || null,
      });
      onClose();
    }
  }

  return (
    <Dropdown open={open} onClose={onClose}>
      <div className="filter-dropdown-presets">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.value}
            className={`filter-preset-btn${periodPreset === p.value ? ' active' : ''}`}
            onClick={() => selectPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="filter-dropdown-divider" />
      <div className="filter-dropdown-custom">
        <label>Custom range</label>
        <div className="filter-custom-inputs">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            placeholder="From"
          />
          <span>to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            placeholder="To"
          />
          <button className="filter-apply-btn" onClick={applyCustom}>Apply</button>
        </div>
      </div>
    </Dropdown>
  );
}

// ---- Searchable list dropdown ----

function SearchableDropdown({
  open,
  onClose,
  items,
  selected,
  onSelect,
  multi = false,
}: {
  open: boolean;
  onClose: () => void;
  items: string[];
  selected: string | string[] | null;
  onSelect: (value: string) => void;
  multi?: boolean;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = items.filter((item) =>
    item.toLowerCase().includes(search.toLowerCase())
  );

  const isSelected = (item: string) => {
    if (multi && Array.isArray(selected)) return selected.includes(item);
    return item === selected;
  };

  return (
    <Dropdown open={open} onClose={onClose}>
      <input
        ref={inputRef}
        className="filter-search-input"
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
      />
      <div className="filter-dropdown-list">
        {filtered.length === 0 && (
          <div className="filter-dropdown-empty">No matches</div>
        )}
        {filtered.map((item) => (
          <button
            key={item}
            className={`filter-list-item${isSelected(item) ? ' active' : ''}`}
            onClick={() => {
              onSelect(item);
              if (!multi) onClose();
            }}
          >
            {multi && (
              <span className={`filter-check${isSelected(item) ? ' checked' : ''}`} />
            )}
            {item}
          </button>
        ))}
      </div>
    </Dropdown>
  );
}

// ---- Filter button ----

interface FilterButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  displayValue: string | null;
  onClick: () => void;
  onClear: () => void;
}

function FilterButton({ icon, label, active, displayValue, onClick, onClear }: FilterButtonProps) {
  return (
    <button
      className={`filter-btn${active ? ' filter-btn-active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span className="filter-btn-label">
        {active && displayValue ? displayValue : label}
      </span>
      {active && (
        <span
          className="filter-btn-clear"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
        >
          <XIcon size={12} />
        </span>
      )}
    </button>
  );
}

// ---- Main FilterBar ----

export default function FilterBar() {
  const periodPreset = useAppStore((s) => s.periodPreset);
  const fromDate = useAppStore((s) => s.fromDate);
  const toDate = useAppStore((s) => s.toDate);
  const account = useAppStore((s) => s.account);
  const tags = useAppStore((s) => s.tags);
  const payee = useAppStore((s) => s.payee);
  const setFilter = useAppStore((s) => s.setFilter);
  const clearFilter = useAppStore((s) => s.clearFilter);
  const clearFilters = useAppStore((s) => s.clearFilters);
  const hasActive = useAppStore((s) => s.hasActiveFilters);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Data queries for dropdowns
  const accountsQuery = useQuery({
    queryKey: ['account-names'],
    queryFn: () => fetchAccountNames(),
    staleTime: 5 * 60 * 1000,
  });
  const tagsQuery = useQuery({
    queryKey: ['all-tags'],
    queryFn: () => fetchTags(),
    staleTime: 5 * 60 * 1000,
  });
  const payeesQuery = useQuery({
    queryKey: ['all-payees'],
    queryFn: () => fetchPayees(),
    staleTime: 5 * 60 * 1000,
  });

  // Period display value
  const periodActive = !!(periodPreset || fromDate || toDate);
  let periodDisplay: string | null = null;
  if (periodPreset) {
    periodDisplay = PERIOD_PRESETS.find((p) => p.value === periodPreset)?.label ?? null;
  } else if (fromDate || toDate) {
    periodDisplay = `${fromDate ?? '...'} – ${toDate ?? '...'}`;
  }

  // Tag display
  const tagsActive = tags.length > 0;
  const tagsDisplay = tagsActive ? tags.map((t) => `#${t}`).join(', ') : null;

  // Resolved dates for display hint
  const { from_date, to_date } = resolvePeriodDates({ periodPreset, fromDate, toDate });
  const _resolvedHint = from_date || to_date;

  function toggleDropdown(name: string) {
    setOpenDropdown((prev) => (prev === name ? null : name));
  }

  function handleAccountSelect(value: string) {
    setFilter({ account: value });
  }

  function handleTagSelect(value: string) {
    const current = tags;
    if (current.includes(value)) {
      setFilter({ tags: current.filter((t) => t !== value) });
    } else {
      setFilter({ tags: [...current, value] });
    }
  }

  function handlePayeeSelect(value: string) {
    setFilter({ payee: value });
  }

  return (
    <div className="filter-bar" id="filter-bar">
      <div className="filter-btn-group">
        <FilterButton
          icon={<CalendarIcon />}
          label="Period"
          active={periodActive}
          displayValue={periodDisplay}
          onClick={() => toggleDropdown('period')}
          onClear={() => clearFilter('periodPreset')}
        />
        <PeriodDropdown
          open={openDropdown === 'period'}
          onClose={() => setOpenDropdown(null)}
        />
      </div>

      <div className="filter-btn-group">
        <FilterButton
          icon={<AccountIcon />}
          label="Account"
          active={!!account}
          displayValue={account}
          onClick={() => toggleDropdown('account')}
          onClear={() => clearFilter('account')}
        />
        <SearchableDropdown
          open={openDropdown === 'account'}
          onClose={() => setOpenDropdown(null)}
          items={accountsQuery.data?.accounts ?? []}
          selected={account}
          onSelect={handleAccountSelect}
        />
      </div>

      <div className="filter-btn-group">
        <FilterButton
          icon={<TagIcon />}
          label="Tag"
          active={tagsActive}
          displayValue={tagsDisplay}
          onClick={() => toggleDropdown('tag')}
          onClear={() => clearFilter('tags')}
        />
        <SearchableDropdown
          open={openDropdown === 'tag'}
          onClose={() => setOpenDropdown(null)}
          items={tagsQuery.data?.tags ?? []}
          selected={tags}
          onSelect={handleTagSelect}
          multi
        />
      </div>

      <div className="filter-btn-group">
        <FilterButton
          icon={<UserIcon />}
          label="Payee"
          active={!!payee}
          displayValue={payee}
          onClick={() => toggleDropdown('payee')}
          onClear={() => clearFilter('payee')}
        />
        <SearchableDropdown
          open={openDropdown === 'payee'}
          onClose={() => setOpenDropdown(null)}
          items={payeesQuery.data?.payees ?? []}
          selected={payee}
          onSelect={handlePayeeSelect}
        />
      </div>

      {hasActive() && (
        <>
          <span className="filter-separator" />
          <button className="filter-clear-all" onClick={clearFilters}>
            Clear all
          </button>
        </>
      )}

      {_resolvedHint && periodPreset && (
        <span className="filter-date-hint">
          {from_date} – {to_date}
        </span>
      )}
    </div>
  );
}
