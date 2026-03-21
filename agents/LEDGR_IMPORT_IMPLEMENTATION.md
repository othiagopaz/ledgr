# Plan: Bank Statement Import (CSV)

## Context

Users spend 80% of their time on manual data entry. Ledgr needs a built-in CSV import flow that lets users upload a bank CSV, map columns to beancount fields, preview extracted transactions, and commit them to the ledger file. No external beangulp config needed -- Ledgr handles it natively.

## User Flow

1. User clicks "Import" in sidebar (or Cmd+K > "Import CSV")
2. User uploads a CSV file via file picker
3. Backend parses CSV headers and sample rows, returns them to frontend
4. User maps CSV columns: Date, Description, Amount (or Debit/Credit), and picks the target Account
5. Frontend shows preview table of extracted transactions (with smart suggestions for transfer accounts)
6. User reviews, edits, deselects duplicates, then clicks "Import"
7. Backend appends selected transactions to the beancount file
8. Ledger reloads, user sees new transactions in the register

## Architecture

### Backend (3 new files)

**`backend/importer.py`** -- CSV parsing + column mapping logic
- `parse_csv_preview(filepath) -> {headers, sample_rows, row_count}` -- read first 10 rows + headers
- `extract_transactions(filepath, mapping, account, currency) -> list[dict]` -- apply column mapping, return transaction dicts
- `mapping` is: `{date_col, description_col, amount_col, debit_col, credit_col, date_format}`
- Handle common CSV quirks: BOM, semicolon delimiter, quoted fields, decimal comma (Brazilian CSVs use `;` and `,` as decimal)
- Detect delimiter automatically (`,` vs `;` vs `\t`)
- Parse amounts: handle `R$ 1.234,56` and `1,234.56` formats based on locale

**`backend/routes/importer.py`** -- FastAPI routes
- `POST /api/import/upload` -- accept file upload, save to temp, return preview (headers + sample rows + detected delimiter)
- `POST /api/import/extract` -- accept mapping config + file reference, return extracted transactions as JSON
- `POST /api/import/commit` -- accept list of approved transactions, append to beancount file using existing `engine.add_transaction()` pattern

**`backend/routes/__init__.py`** -- register new router

### Frontend (2 new files)

**`frontend/src/components/ImportView.tsx`** -- main import flow component
- Step 1: File upload dropzone (drag & drop or click)
- Step 2: Column mapping form (dropdowns to assign CSV columns)
  - Date column + date format selector
  - Description column
  - Amount column (single) OR Debit + Credit columns (split)
  - Target account (autocomplete from existing accounts)
  - Currency (defaults to operating_currency)
- Step 3: Preview table showing extracted transactions
  - Each row: date, description, suggested transfer account, amount, checkbox to include/exclude
  - Duplicate detection: flag rows where date+amount+description match existing transactions
- Step 4: Commit button

**`frontend/src/api/client.ts`** -- 3 new fetch functions
- `uploadCSV(file: File) -> ImportPreview`
- `extractTransactions(fileId, mapping) -> ImportedTransaction[]`
- `commitTransactions(transactions) -> MutationResponse`

### Types (`frontend/src/types/index.ts`)

```typescript
interface ImportPreview {
  file_id: string;
  headers: string[];
  sample_rows: string[][];
  row_count: number;
  detected_delimiter: string;
}

interface ColumnMapping {
  date_col: string;
  description_col: string;
  amount_col?: string;       // single amount column
  debit_col?: string;        // OR separate debit/credit
  credit_col?: string;
  date_format: string;       // e.g. "DD/MM/YYYY"
  account: string;           // target account
  currency: string;
}

interface ImportedTransaction {
  date: string;
  description: string;
  amount: number;
  transfer_account: string;  // suggested by smart suggestions
  is_duplicate: boolean;
  selected: boolean;
  raw_row: string[];
}
```

### Integration Points (existing code to reuse)

- **`engine.py:add_transaction()`** -- reuse for committing each approved transaction
- **`engine.py:get_suggestions()`** -- call for each payee/description to suggest transfer accounts
- **`api/client.ts:fetchAccountNames()`** -- reuse for account autocomplete in mapping step
- **`InlineAutocomplete`** component -- reuse for account picker in mapping form
- **`formatAmount()` / `formatDateShort()`** -- reuse in preview table
- **`getLocale()`** -- use to detect decimal format for CSV parsing

### File Upload Strategy

- Backend saves uploaded CSV to a temp directory with a UUID filename
- Returns the UUID as `file_id` for subsequent requests
- Temp files are cleaned up after 1 hour or on server restart
- No file stored permanently -- only the extracted transactions get committed

## Files to Create/Modify

| File | Action |
|------|--------|
| `backend/importer.py` | Create -- CSV parsing, column mapping, extraction |
| `backend/routes/importer.py` | Create -- 3 API endpoints |
| `backend/main.py` | Modify -- register importer router |
| `frontend/src/components/ImportView.tsx` | Create -- full import flow UI |
| `frontend/src/api/client.ts` | Modify -- add 3 fetch functions |
| `frontend/src/types/index.ts` | Modify -- add import types |
| `frontend/src/components/Sidebar.tsx` | Modify -- add "Import" nav item |
| `frontend/src/stores/appStore.ts` | Modify -- add 'import' tab type |
| `frontend/src/App.tsx` | Modify -- render ImportView for import tabs |
| `frontend/src/styles/global.css` | Modify -- add import view styles |

## Verification

1. Start backend: `cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8080`
2. Start frontend: `cd frontend && npm run dev`
3. Click "Import" in sidebar
4. Upload a test CSV (create `data/test_import.csv` with sample bank data)
5. Map columns, verify preview shows correct dates/amounts
6. Commit, verify transactions appear in the register
7. Run `npm run build` to verify TypeScript compiles
