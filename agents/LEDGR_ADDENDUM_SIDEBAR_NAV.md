# Ledgr — Addendum: Sidebar Tree Navigation

> **Depends on:** Task 1 (Zustand store), Task 2 (Theme system)  
> **Modifies:** `AccountTree.tsx`, `appStore.ts`, `global.css`  
> **Execute after:** Task 4 (Tab system) — because `Enter` needs to open tabs

---

## Context: The GnuCash Blue Selection Bar

GnuCash's account tree has a **single visible cursor** — a solid blue highlight bar that moves with keyboard arrows. This is the same interaction model as macOS Finder's list view or Windows Explorer's tree. It's fast because:

1. The cursor is always visible (no hover-dependent focus)
2. `↑`/`↓` moves through the **flat visible list** (skipping collapsed children)
3. `→` expands a collapsed node OR moves to first child if already expanded
4. `←` collapses an expanded node OR jumps to parent if already collapsed/leaf
5. `Enter` opens the selected account in the register
6. The selection persists — you can look away and still know where you are

The current `AccountTree.tsx` has NO keyboard navigation and NO visible selection cursor (only a light blue highlight on the currently-opened account, via `.selected` class).

---

## Store Additions

### Modify `frontend/src/stores/appStore.ts`

Add to the `AppState` interface:

```typescript
// Sidebar navigation
sidebarCursorAccount: string | null;  // which account has the blue bar
sidebarExpandedAccounts: Set<string>; // which group accounts are expanded
setSidebarCursor: (account: string | null) => void;
toggleSidebarExpanded: (account: string) => void;
setSidebarExpanded: (account: string, expanded: boolean) => void;
```

Implementation notes:
- `sidebarExpandedAccounts` starts with top-level groups expanded: `new Set(['Assets', 'Liabilities', 'Income', 'Expenses', 'Equity'])`
- `toggleSidebarExpanded` adds or removes from the Set
- `setSidebarExpanded(account, true)` adds, `false` removes

---

## Modify `frontend/src/components/AccountTree.tsx`

### 1. Build a flat visible list

The tree has nested `AccountNode` objects. For keyboard navigation, we need a **flattened list of only the visible accounts** (respecting which groups are expanded/collapsed).

Create a utility function inside the component:

```typescript
interface FlatItem {
  account: string;     // full account name e.g. "Assets:Bank:Itau"
  depth: number;       // indentation level (0 = top-level)
  hasChildren: boolean; // can it expand/collapse?
  isExpanded: boolean;  // is it currently expanded?
  node: AccountNode;    // reference to the original node
}

function flattenTree(
  nodes: AccountNode[],
  expandedSet: Set<string>,
  depth: number = 0
): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedSet.has(node.name);
    result.push({ account: node.name, depth, hasChildren, isExpanded, node });
    if (hasChildren && isExpanded) {
      result.push(...flattenTree(node.children, expandedSet, depth + 1));
    }
  }
  return result;
}
```

Call it on every render:
```typescript
const expandedAccounts = useAppStore((s) => s.sidebarExpandedAccounts);
const flatItems = useMemo(
  () => flattenTree(accounts, expandedAccounts),
  [accounts, expandedAccounts]
);
```

### 2. Render from the flat list

Replace the current recursive `AccountGroup` rendering with a flat `.map()` over `flatItems`. Each item renders as a single row:

```tsx
{flatItems.map((item) => (
  <div
    key={item.account}
    className={`sidebar-row ${item.account === cursorAccount ? 'sidebar-cursor' : ''} ${item.account === activeAccount ? 'sidebar-active' : ''}`}
    style={{ paddingLeft: `${12 + item.depth * 16}px` }}
    onClick={() => handleClick(item)}
  >
    {item.hasChildren && (
      <span className="tree-chevron">
        {item.isExpanded ? '▾' : '▸'}
      </span>
    )}
    {!item.hasChildren && <span className="tree-chevron-spacer" />}
    <span className="sidebar-row-name">{getShortName(item.account)}</span>
    <span className="sidebar-row-balance">
      <BalanceDisplay balances={item.node.balance} />
    </span>
  </div>
))}
```

Where:
- `cursorAccount` = `useAppStore((s) => s.sidebarCursorAccount)`
- `activeAccount` = the account currently open in the active tab
- `getShortName` = last segment of the colon-separated name (or the full name for top-level)

### 3. Click behavior

```typescript
function handleClick(item: FlatItem) {
  // Always move cursor to clicked item
  setSidebarCursor(item.account);
  
  if (item.hasChildren) {
    // Toggle expand/collapse
    toggleSidebarExpanded(item.account);
  }
  
  // Open in tab (whether leaf or group — groups can have transactions too)
  openTab({
    id: `register:${item.account}`,
    type: 'register',
    account: item.account,
    label: getShortName(item.account),
  });
}
```

### 4. Keyboard handler

Add a `useEffect` with a `keydown` listener. The listener should ONLY be active when `focusZone === 'sidebar'`.

```typescript
const focusZone = useAppStore((s) => s.focusZone);
const setFocusZone = useAppStore((s) => s.setFocusZone);

useEffect(() => {
  if (focusZone !== 'sidebar') return;

  function handleKeyDown(e: KeyboardEvent) {
    // Don't capture when in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const currentIndex = flatItems.findIndex(
      (item) => item.account === cursorAccount
    );

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = Math.min(currentIndex + 1, flatItems.length - 1);
        setSidebarCursor(flatItems[next].account);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = Math.max(currentIndex - 1, 0);
        setSidebarCursor(flatItems[prev].account);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (currentIndex < 0) break;
        const item = flatItems[currentIndex];
        if (item.hasChildren && !item.isExpanded) {
          // Expand
          setSidebarExpanded(item.account, true);
        } else if (item.hasChildren && item.isExpanded) {
          // Move to first child
          const nextIndex = currentIndex + 1;
          if (nextIndex < flatItems.length) {
            setSidebarCursor(flatItems[nextIndex].account);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (currentIndex < 0) break;
        const item = flatItems[currentIndex];
        if (item.hasChildren && item.isExpanded) {
          // Collapse
          setSidebarExpanded(item.account, false);
        } else {
          // Jump to parent
          const parentName = item.account.split(':').slice(0, -1).join(':');
          if (parentName) {
            setSidebarCursor(parentName);
          }
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (currentIndex < 0) break;
        const item = flatItems[currentIndex];
        openTab({
          id: `register:${item.account}`,
          type: 'register',
          account: item.account,
          label: getShortName(item.account),
        });
        // Move focus to register after opening
        setFocusZone('register');
        break;
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [focusZone, flatItems, cursorAccount]);
```

### 5. Focus zone switching

The sidebar should claim focus when:
- User clicks anywhere in the sidebar → `setFocusZone('sidebar')`
- User presses `Cmd+1` or a dedicated shortcut → `setFocusZone('sidebar')`

Add an `onClick` on the sidebar container div:
```tsx
<div className="sidebar" onClick={() => setFocusZone('sidebar')}>
```

And in the register area:
```tsx
<div className="main-content" onClick={() => setFocusZone('register')}>
```

### 6. Auto-scroll into view

When the cursor moves via keyboard, the highlighted row must scroll into view:

```typescript
useEffect(() => {
  if (!cursorAccount) return;
  const el = document.querySelector(`.sidebar-row[data-account="${cursorAccount}"]`);
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}, [cursorAccount]);
```

Add `data-account={item.account}` to each sidebar row div for this selector to work.

---

## CSS: The Blue Selection Bar

Add to `frontend/src/styles/global.css`:

```css
/* Sidebar row base */
.sidebar-row {
  display: flex;
  align-items: center;
  height: 28px;
  padding-right: 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  user-select: none;
  position: relative;
}

.sidebar-row:hover {
  background: var(--bg-row-hover);
}

/* THE BLUE BAR — keyboard cursor */
.sidebar-row.sidebar-cursor {
  background: var(--accent);
  color: #ffffff;
}

.sidebar-row.sidebar-cursor .sidebar-row-balance {
  color: rgba(255, 255, 255, 0.85);
}

.sidebar-row.sidebar-cursor .tree-chevron {
  color: rgba(255, 255, 255, 0.7);
}

/* Active account indicator (currently open in register) — subtle left border */
.sidebar-row.sidebar-active:not(.sidebar-cursor) {
  border-left: 3px solid var(--accent);
}

/* Chevron toggle */
.tree-chevron {
  width: 14px;
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
  text-align: center;
}

.tree-chevron-spacer {
  width: 14px;
  flex-shrink: 0;
}

/* Name */
.sidebar-row-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: 4px;
}

/* Balance (right-aligned) */
.sidebar-row-balance {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Top-level groups get bolder styling */
.sidebar-row[data-depth="0"] .sidebar-row-name {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.sidebar-row.sidebar-cursor[data-depth="0"] .sidebar-row-name {
  color: #ffffff;
}
```

### Dark theme override for the blue bar

In the `[data-theme="dark"]` block:
```css
[data-theme="dark"] .sidebar-row.sidebar-cursor {
  background: #2563eb;  /* slightly brighter blue for dark backgrounds */
}
```

In the `[data-theme="light"]` block:
```css
[data-theme="light"] .sidebar-row.sidebar-cursor {
  background: #1a73e8;  /* Google-blue, matches the GnuCash screenshot vibe */
}
```

---

## Remove old AccountTree styles

Delete these CSS classes from `global.css` as they are replaced by the new flat rendering:
- `.account-group`
- `.account-group-header`
- `.account-item`
- `.account-item.selected`
- `.account-item.zero`
- `.account-item .name`
- `.account-item .indent`
- `.account-item .balance`

---

## Acceptance Criteria

1. The sidebar renders a flat list of accounts respecting expand/collapse state
2. A solid blue highlight bar shows the current cursor position
3. `↑`/`↓` moves the blue bar through visible accounts
4. `→` expands a collapsed group, or moves to first child if already expanded
5. `←` collapses an expanded group, or jumps to parent if leaf/collapsed
6. `Enter` opens the selected account in a tab and moves focus to the register
7. Clicking a row moves the cursor AND opens/toggles the account
8. The blue bar scrolls into view when moving with keyboard
9. The blue bar is visible in both dark and light themes
10. Top-level groups (Assets, Liabilities, etc.) render with uppercase/bold styling
11. When focus is on the register (not sidebar), arrow keys do NOT move the sidebar cursor
