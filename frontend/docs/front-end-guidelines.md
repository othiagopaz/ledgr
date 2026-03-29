# Front-End Guidelines — Ledgr

Reference guide for AI agents working on the Ledgr frontend.
**Prerequisite**: read `AGENTS.md` at the repo root first — it covers project
context, architecture, and the backend contract this frontend depends on.

---

## 1. Stack & dependencies

| Package                    | Version  | Purpose                        |
|----------------------------|----------|--------------------------------|
| `react`                    | ^19      | Core framework                 |
| `react-dom`               | ^19      | DOM rendering                  |
| `zustand`                  | ^5       | State management               |
| `@tanstack/react-query`   | ^5       | Server state & caching         |
| `@tanstack/react-virtual` | ^3       | Virtual scrolling (registers)  |
| `recharts`                 | ^3       | Charts & graphs                |
| `vite`                     | ^8       | Build tool & dev server        |
| `typescript`               | ~5.9     | Type checking (strict mode)    |
| `eslint`                   | ^9       | Linting (no Prettier)          |

No component library (no shadcn, MUI, Ant Design). All UI is custom-built.

---

## 2. Directory structure

```
frontend/src/
├── api/
│   └── client.ts              # Typed fetch wrappers — the ONLY place that calls fetch()
├── components/
│   ├── Dashboard.tsx           # Summary cards & embedded charts
│   ├── Sidebar.tsx             # Navigation & recent accounts
│   ├── StatusBar.tsx           # Footer status bar
│   ├── PlannedToggle.tsx       # Actual ↔ Actual + Planned pill button
│   ├── CommandPalette.tsx      # Cmd+K fuzzy-search command menu
│   ├── AccountRegister.tsx     # Transaction table for a single account
│   ├── TransactionModal.tsx    # Modal form for transaction CRUD
│   ├── AccountModal.tsx        # Modal form for account CRUD
│   ├── InlineEditor.tsx        # Inline transaction editing in register
│   ├── InlineAutocomplete.tsx  # Reusable autocomplete dropdown
│   └── reports/                # Statement & chart components
│       ├── IncomeStatement.tsx
│       ├── BalanceSheet.tsx
│       ├── CashFlowStatement.tsx
│       ├── IncomeExpenseChart.tsx
│       ├── NetWorthChart.tsx
│       ├── AccountBalanceChart.tsx
│       └── ...
├── hooks/
│   └── useKeyboardNav.ts      # Global keyboard shortcuts
├── stores/
│   └── appStore.ts            # Zustand global store
├── styles/
│   └── global.css             # CSS variables, layout, theme
├── types/
│   └── index.ts               # All TypeScript type definitions
├── utils/
│   ├── format.ts              # Currency & date formatting
│   └── dateUtils.ts           # Smart date parsing
├── App.tsx                    # Root component with tab routing
├── App.css                    # Minimal app-level overrides
├── index.css                  # Base typography
└── main.tsx                   # Entry point — React Query provider setup
```

---

## 3. Styling

### Approach: Vanilla CSS + CSS Variables

No Tailwind, no CSS-in-JS, no CSS Modules. All styles live in plain `.css`
files with a centralized variable system.

### Theme system (`src/styles/global.css`)

```css
:root {
  --bg-primary: ...;
  --bg-secondary: ...;
  --text-primary: ...;
  --text-muted: ...;
  --accent: ...;
  --amount-positive: ...;
  --amount-negative: ...;
  --flag-pending: ...;
  --flag-confirmed: ...;
  --row-height: 32px;
  --sidebar-width: 300px;
  --font-mono: ...;
  --font-sans: ...;
}

@media (prefers-color-scheme: dark) {
  :root { /* dark overrides */ }
}
```

### Rules

- **New colors**: add a CSS variable in `global.css`, never hard-code hex values
- **Dark mode**: every color must work in both light and dark — use variables
- **Layout**: prefer CSS Grid and Flexbox; avoid absolute positioning unless
  necessary (modals are the exception)
- **Component styles**: use `className` strings referencing classes in
  `global.css` or `App.css` — no inline `style={{}}` except for computed values
- **No new CSS files**: add styles to `global.css` unless the component has
  significant standalone styling needs

---

## 4. Component patterns

### File structure

```tsx
// 1. Imports
import { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import type { Transaction } from '../types';

// 2. Props interface (if needed)
interface TransactionRowProps {
  txn: Transaction;
  onSelect: (txn: Transaction) => void;
}

// 3. Component as default export
export default function TransactionRow({ txn, onSelect }: TransactionRowProps) {
  // hooks first
  const viewMode = useAppStore((s) => s.viewMode);
  const [isHovered, setIsHovered] = useState(false);

  // handlers
  const handleClick = () => onSelect(txn);

  // render
  return <div onClick={handleClick}>...</div>;
}
```

### Rules

- **Default exports** for all components
- **Props interface** defined in the same file, directly above the component
- **No barrel files** (`index.ts` re-exports) — import components by their
  file path
- **No wrapper/HOC patterns** — use hooks for shared logic
- **No component library** — all UI is hand-built (modals, autocomplete,
  dropdowns, tabs, command palette)
- **Keep components focused** — if a component exceeds ~500 lines, consider
  extracting sub-components

---

## 5. State management (Zustand)

### Architecture

Single global store in `src/stores/appStore.ts`, accessed via `useAppStore()`.

```tsx
// Reading state — always use a selector
const viewMode = useAppStore((s) => s.viewMode);
const { openTab, closeTab } = useAppStore((s) => ({
  openTab: s.openTab,
  closeTab: s.closeTab,
}));

// Calling actions
useAppStore.getState().toggleViewMode();
```

### What belongs in the store

| In store (global)                     | Local state (`useState`)              |
|---------------------------------------|---------------------------------------|
| Active tab, tab list                  | Form field values                     |
| Modal open/close state                | Hover / focus state                   |
| View mode (actual/combined)           | Dropdown open/close                   |
| Theme preference                      | Temporary validation errors           |
| Command palette open/close            | Component-scoped UI toggles           |

### Rules

- **No slices or reducers** — just plain setter functions in the store
- **Selectors for reads** — `useAppStore((s) => s.thing)`, never
  `useAppStore()` without a selector (causes unnecessary re-renders)
- **`getState()` for fire-and-forget** — actions called outside React
  components (event handlers that don't need re-render) can use
  `useAppStore.getState().action()`
- **Signal pattern** — for cross-component communication without shared data,
  use a counter that increments (e.g., `newTxnRequestId`)

---

## 6. Data fetching (React Query)

### Global config (`main.tsx`)

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

### Query pattern

```tsx
const viewMode = useAppStore((s) => s.viewMode);

const { data, isLoading } = useQuery({
  queryKey: ['income-expense', year, interval, viewMode],
  queryFn: () => fetchIncomeExpense(year, interval, viewMode),
});
```

### Rules

- **`viewMode` in every query key** — so React Query refetches when the
  toggle changes
- **Wrap `queryFn` in a lambda** — `() => fetchFoo(args)`, never pass
  `fetchFoo` directly. React Query passes its own context object as the
  first argument, which corrupts parameters. This was a real bug.
- **Query keys are arrays** — include all parameters that affect the result
- **Mutations invalidate related queries**:
  ```tsx
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
  }
  ```

---

## 7. API layer (`src/api/client.ts`)

### Architecture

Centralized typed fetch wrappers. Components never call `fetch()` directly.

```tsx
// ✅ Correct — component uses API function
const data = await fetchTransactions(account, viewMode);

// ❌ Wrong — component calls fetch directly
const res = await fetch(`/api/transactions?account=${account}`);
```

### Adding a new endpoint

1. Add the fetch function in `client.ts`
2. Define the response type in `src/types/index.ts`
3. Use it in the component via `useQuery` or direct call for mutations

### `viewMode` parameter

Every endpoint that reads entries accepts `view_mode` as a query parameter.
The API client always passes it:

```tsx
export async function fetchIncomeExpense(
  year: number, interval: string, viewMode: string
): Promise<IncomeExpenseResponse> {
  const params = new URLSearchParams({ year: String(year), interval, view_mode: viewMode });
  return get(`/api/reports/income-expense?${params}`);
}
```

For chart endpoints, when `viewMode === 'combined'`, components send
`view_mode=comparative` to get separate actual/planned series for stacked
rendering. Non-chart components send the raw `viewMode` value.

---

## 8. TypeScript conventions

### Compiler strictness (`tsconfig.app.json`)

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedSideEffectImports": true,
  "erasableSyntaxOnly": true
}
```

### Rules

- **All API responses must have explicit types** in `src/types/index.ts`
- **No `any`** without a justifying comment explaining why it's necessary
- **Props interfaces** defined in the component file, not in `types/index.ts`
  (unless shared across multiple components)
- **Use `type` imports** when importing only types: `import type { Foo } from ...`
- **Centralized types** — all shared types (API responses, domain models) live
  in `src/types/index.ts`. Do not scatter type definitions across files.

---

## 9. Utilities

### `src/utils/format.ts`

| Function | Purpose |
|----------|---------|
| `getLocale(currency)` | Maps currency code → locale string |
| `formatAmount(value, currency)` | Formats number with locale-aware currency |
| `formatDateShort(isoDate, currency)` | Short date per locale |
| `formatDateFull(isoDate, currency)` | Full date per locale |
| `getDatePlaceholder(currency)` | Input placeholder matching locale format |

### `src/utils/dateUtils.ts`

| Function | Purpose |
|----------|---------|
| `today()` | Returns current date as `YYYY-MM-DD` |
| `parseSmartDate(input)` | Parses `"t"` → today, `"y"` → yesterday, `"DD/MM/YYYY"`, `"DD/MM"`, ISO dates |

### `src/hooks/useKeyboardNav.ts`

Global keyboard shortcuts registered in `App.tsx`:

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette |
| `Cmd+Shift+N` / `Alt+N` | New transaction |
| `N` | New transaction (when not in input) |
| `P` | Toggle view mode (actual ↔ combined) |
| `Escape` | Close command palette |
| `Cmd+W` | Close current tab |

When adding new shortcuts, register them in `useKeyboardNav.ts` and ensure
they don't conflict with browser defaults or existing shortcuts.

---

## 10. Navigation / tab system

### MDI-style tabs

The app uses an IDE-like tab system instead of URL routing.

```tsx
interface Tab {
  id: string;           // e.g., "register:Expenses:Food"
  type: 'register' | 'report' | 'accounts' | 'dashboard';
  account?: string;     // For register tabs
  label: string;        // Display name in tab bar
}
```

### How to add a new tab type

1. Add the type to the `Tab` union in `types/index.ts`
2. Add a case in `App.tsx` render switch to render the right component
3. Create an `openTab()` call in the relevant trigger (sidebar, command palette)

### Behavior

- Clicking an existing tab switches to it (no duplicates)
- `Cmd+W` closes the active tab
- Tab overflow is handled with a "more" dropdown menu

---

## 11. Planned toggle (frontend)

### State

`viewMode` lives in `appStore.ts` as `'actual' | 'combined'`.

### UI

- `PlannedToggle.tsx` renders a pill button in the app header
- `P` key toggles between states (via `useKeyboardNav.ts`)

### Effect on queries

Every `useQuery` includes `viewMode` in its `queryKey`, so toggling
automatically triggers refetches across all visible data.

### Chart rendering in combined mode

| Chart | Actual mode | Combined mode |
|-------|-------------|---------------|
| **Income vs Expenses** | Solid bars | Stacked: solid actual + translucent planned. Income above zero, expenses below. |
| **Net Worth** | Solid line | Solid line (actual) + dashed line (actual+planned) |
| **Dashboard cards** | Main value | Combined total as main value, "X planned" subtitle |

When `viewMode === 'combined'`, chart components send `view_mode=comparative`
to the API to receive separate `series` and `planned_series` arrays.
Non-chart components send `view_mode=combined`.

---

## 12. Loading, error, and empty states

### Standard pattern

```tsx
const { data, isLoading } = useQuery({ ... });

if (isLoading) return <div className="report-loading">Loading...</div>;
if (!data)     return <div className="report-empty">No data</div>;

return <div>{ /* render data */ }</div>;
```

### Rules

- Every data-fetching component must handle all three states
- Use `report-loading` and `report-empty` CSS classes for consistent styling
- Error states in modals: wrap mutation calls in try-catch, display error
  message from the API response (`data.detail`)
- The app header shows a persistent error banner for `.beancount` parsing
  errors returned by `/api/errors`

---

## 13. Naming conventions

| Context            | Convention         | Example                    |
|--------------------|--------------------|----------------------------|
| Component files    | `PascalCase.tsx`   | `TransactionModal.tsx`     |
| Hook files         | `usePascalCase.ts` | `useKeyboardNav.ts`        |
| Utility files      | `camelCase.ts`     | `format.ts`, `dateUtils.ts`|
| Store files        | `camelCase.ts`     | `appStore.ts`              |
| Type files         | `camelCase.ts`     | `index.ts`                 |
| CSS files          | `camelCase.css`    | `global.css`               |
| Functions          | `camelCase`        | `formatAmount()`           |
| Components         | `PascalCase`       | `AccountRegister`          |
| Interfaces/Types   | `PascalCase`       | `Transaction`, `ViewMode`  |
| Constants          | `UPPER_SNAKE_CASE` | `BASE_URL`                 |
| CSS variables      | `--kebab-case`     | `--bg-primary`             |

---

## 14. Known failure modes — do not repeat

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Passing `fetchFoo` directly as `queryFn` | React Query passes context object as arg → `[object Object]` in URL | Always wrap: `() => fetchFoo(args)` |
| Omitting `viewMode` from `queryKey` | Data not refetched when toggle changes → stale UI | Include `viewMode` in every query key |
| Calling `fetch()` directly in a component | Bypasses typed wrappers, no error handling | Use `src/api/client.ts` functions |
| Using `any` to silence type errors | Hides real bugs, breaks strict mode | Define proper types in `src/types/index.ts` |
| Hard-coding hex colors in components | Breaks dark mode | Use CSS variables from `global.css` |
| Using `useAppStore()` without selector | Component re-renders on every store change | Always pass a selector function |
| Adding inline `style={{}}` for static styles | Inconsistent with codebase, harder to maintain | Use CSS classes in `global.css` |

---

## 16. Command palette — all actions must be accessible

Every new user-facing action **must** be registered in the Cmd+K command palette (`CommandPalette.tsx`).

This is a hard rule, not a suggestion. The command palette is the primary keyboard-driven entry point for every action in the app.

### What this means in practice

- New modal (e.g., "New Series") → add a palette item: `"New Series"` that calls the relevant store action
- New view/tab (e.g., "Series") → add a palette item: `"View Series"` that calls `openTab()`
- New action (e.g., "Export") → add a palette item that triggers the action

### Group names in the palette

| Group | Purpose |
|-------|---------|
| `"Actions"` | Primary CRUD and navigation actions (New Transaction, New Account, New Series) |
| `"Views"` | Navigate to a specific tab (Dashboard, Accounts, Reports, Series) |
| `"Accounts"` | Individual account register tabs |

When adding a new entry, place it in the correct group and use consistent label conventions:
- Create actions: `"New <Thing>"`
- Navigate actions: `"View <Thing>"`

---

## 15. Frontend PR checklist

- [ ] `eslint` passes with no errors
- [ ] No `any` without a justifying comment
- [ ] New API responses have types in `src/types/index.ts`
- [ ] `viewMode` included in all new `queryKey` arrays
- [ ] `queryFn` wrapped in lambda: `() => fetchFn(args)`
- [ ] Loading and empty states handled for data-fetching components
- [ ] New colors use CSS variables (works in light + dark mode)
- [ ] New keyboard shortcuts registered in `useKeyboardNav.ts` and don't
      conflict with existing ones
- [ ] No direct `fetch()` calls — use `src/api/client.ts`
