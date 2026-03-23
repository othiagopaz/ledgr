"""
Validation Script — Income Statement & Balance Sheet
=====================================================
Compares Ledgr's router logic against native Beancount/Fava computations.

Three validation paths:
  A) "Router replica" — replicates exactly what reports.py does
  B) "Pure Fava" — uses realization.realize() to compute from the tree
  C) "BQL cross-check" — uses Beancount's query language for independent verification

If A == B == C, we're golden.
If they diverge, we know exactly where the bug lives.
"""

from __future__ import annotations

import datetime
import sys
from decimal import Decimal
from collections import defaultdict

from beancount.core import data, realization
from beancount.ops import summarize
try:
    from beancount.query import query as bql
except ImportError:
    from beanquery import query as bql
from fava.core import FavaLedger

# Import serializers from the actual codebase
sys.path.insert(0, "/home/claude")
from serializers import build_report_tree, build_balance_tree, decimal_to_report_number


BEANCOUNT_FILE = "/home/claude/example.beancount"
OPERATING_CURRENCY = "USD"  # The example uses USD


def load_ledger() -> FavaLedger:
    ledger = FavaLedger(BEANCOUNT_FILE)
    errors = ledger.errors
    if errors:
        print(f"⚠️  Ledger loaded with {len(errors)} errors:")
        for e in errors[:5]:
            print(f"   {e}")
    else:
        print("✅ Ledger loaded with 0 errors")
    print(f"   Total entries: {len(ledger.all_entries)}")
    txn_count = sum(1 for e in ledger.all_entries if isinstance(e, data.Transaction))
    print(f"   Transactions: {txn_count}")
    
    # Check currencies in use
    currencies = set()
    for e in ledger.all_entries:
        if isinstance(e, data.Transaction):
            for p in e.postings:
                if p.units:
                    currencies.add(p.units.currency)
    print(f"   Currencies found: {sorted(currencies)}")
    return ledger


# =====================================================================
# INCOME STATEMENT VALIDATION
# =====================================================================

def validate_income_statement(ledger: FavaLedger):
    print("\n" + "=" * 70)
    print("INCOME STATEMENT VALIDATION")
    print("=" * 70)

    # --- PATH A: Router replica (what reports.py does) ---
    print("\n--- Path A: Router Replica ---")
    router_result = _income_statement_router_replica(ledger)
    
    # --- PATH B: Pure Fava realization ---
    print("\n--- Path B: Pure Fava Realization ---")
    fava_result = _income_statement_pure_fava(ledger)
    
    # --- PATH C: BQL cross-check ---
    print("\n--- Path C: BQL Cross-Check ---")
    bql_result = _income_statement_bql(ledger)

    # --- COMPARE ---
    print("\n--- COMPARISON ---")
    print(f"{'Method':<25} {'Total Income':>15} {'Total Expenses':>15} {'Net Income':>15}")
    print("-" * 70)
    for name, res in [("A) Router Replica", router_result),
                       ("B) Pure Fava", fava_result),
                       ("C) BQL", bql_result)]:
        print(f"{name:<25} {res['total_income']:>15.2f} {res['total_expenses']:>15.2f} {res['net_income']:>15.2f}")
    
    # Check agreement
    all_agree = (
        abs(router_result["net_income"] - fava_result["net_income"]) < 0.01
        and abs(router_result["net_income"] - bql_result["net_income"]) < 0.01
    )
    if all_agree:
        print("\n✅ All three paths agree on net income!")
    else:
        print("\n❌ DIVERGENCE DETECTED — numbers don't match!")
    
    # Check multi-currency contamination
    print("\n--- Multi-Currency Check ---")
    _check_multicurrency_income(ledger)

    return router_result


def _income_statement_router_replica(ledger: FavaLedger) -> dict:
    """Exact replica of what reports.py get_income_statement() does."""
    txn_dates = [e.date for e in ledger.all_entries if isinstance(e, data.Transaction)]
    begin = min(txn_dates)
    end = max(txn_dates) + datetime.timedelta(days=1)
    
    clamped, _ = summarize.clamp_opt(ledger.all_entries, begin, end, ledger.options)
    txns = [e for e in clamped if isinstance(e, data.Transaction)]
    
    total_income = Decimal(0)
    total_expenses = Decimal(0)
    
    account_period: dict[str, dict[str, Decimal]] = {}
    
    for txn in txns:
        for p in txn.postings:
            if p.units is None:
                continue
            acct_type = p.account.split(":")[0]
            if acct_type == "Income":
                total_income += -p.units.number  # Income is negative in beancount
            elif acct_type == "Expenses":
                total_expenses += p.units.number

    net = float(total_income) - float(total_expenses)
    print(f"  Total Income (all currencies summed!): {float(total_income):,.2f}")
    print(f"  Total Expenses (all currencies summed!): {float(total_expenses):,.2f}")
    print(f"  Net Income: {net:,.2f}")
    
    return {
        "total_income": float(total_income),
        "total_expenses": float(total_expenses),
        "net_income": net,
    }


def _income_statement_pure_fava(ledger: FavaLedger) -> dict:
    """Use Fava's realization to compute income/expenses — the 'reference' way."""
    txn_dates = [e.date for e in ledger.all_entries if isinstance(e, data.Transaction)]
    begin = min(txn_dates)
    end = max(txn_dates) + datetime.timedelta(days=1)
    
    clamped, _ = summarize.clamp_opt(ledger.all_entries, begin, end, ledger.options)
    real_root = realization.realize(clamped)
    
    def sum_tree(root_type: str) -> dict[str, Decimal]:
        """Sum all positions by currency under a root account type."""
        node = realization.get(real_root, root_type)
        if node is None:
            return {}
        bal = realization.compute_balance(node)
        by_currency: dict[str, Decimal] = {}
        for pos in bal:
            curr = pos.units.currency
            by_currency[curr] = by_currency.get(curr, Decimal(0)) + pos.units.number
        return by_currency
    
    income_by_curr = sum_tree("Income")
    expenses_by_curr = sum_tree("Expenses")
    
    print("  Income by currency:")
    for curr, val in sorted(income_by_curr.items()):
        print(f"    {curr}: {float(-val):,.2f}")  # negate for display
    
    print("  Expenses by currency:")
    for curr, val in sorted(expenses_by_curr.items()):
        print(f"    {curr}: {float(val):,.2f}")
    
    # For comparison, sum only operating currency
    income_oc = float(-income_by_curr.get(OPERATING_CURRENCY, Decimal(0)))
    expenses_oc = float(expenses_by_curr.get(OPERATING_CURRENCY, Decimal(0)))
    
    # Also sum ALL (what the router does)
    income_all = float(sum(-v for v in income_by_curr.values()))
    expenses_all = float(sum(v for v in expenses_by_curr.values()))
    
    print(f"\n  {OPERATING_CURRENCY}-only: Income={income_oc:,.2f}, Expenses={expenses_oc:,.2f}, Net={income_oc - expenses_oc:,.2f}")
    print(f"  All-currencies-summed: Income={income_all:,.2f}, Expenses={expenses_all:,.2f}, Net={income_all - expenses_all:,.2f}")
    
    return {
        "total_income": income_all,  # matches router behavior
        "total_expenses": expenses_all,
        "net_income": income_all - expenses_all,
    }


def _income_statement_bql(ledger: FavaLedger) -> dict:
    """Use BQL queries to independently compute totals."""
    # Income total (BQL returns in beancount sign convention: negative for income)
    result_types, result_rows = bql.run_query(
        ledger.all_entries,
        ledger.options,
        "SELECT sum(position) AS total WHERE account ~ '^Income:'"
    )
    
    income_total = Decimal(0)
    income_by_curr = {}
    if result_rows:
        inv = result_rows[0][0]
        for pos in inv:
            curr = pos.units.currency
            income_by_curr[curr] = pos.units.number
            income_total += -pos.units.number  # negate
    
    # Expenses total
    result_types, result_rows = bql.run_query(
        ledger.all_entries,
        ledger.options,
        "SELECT sum(position) AS total WHERE account ~ '^Expenses:'"
    )
    
    expenses_total = Decimal(0)
    expenses_by_curr = {}
    if result_rows:
        inv = result_rows[0][0]
        for pos in inv:
            curr = pos.units.currency
            expenses_by_curr[curr] = pos.units.number
            expenses_total += pos.units.number
    
    print(f"  BQL Income by currency: {dict(income_by_curr)}")
    print(f"  BQL Expenses by currency: {dict(expenses_by_curr)}")
    print(f"  Total Income: {float(income_total):,.2f}")
    print(f"  Total Expenses: {float(expenses_total):,.2f}")
    print(f"  Net: {float(income_total - expenses_total):,.2f}")
    
    return {
        "total_income": float(income_total),
        "total_expenses": float(expenses_total),
        "net_income": float(income_total - expenses_total),
    }


def _check_multicurrency_income(ledger: FavaLedger):
    """Check if non-operating currencies are being mixed into the totals."""
    non_oc_income = Decimal(0)
    non_oc_expenses = Decimal(0)
    non_oc_examples = []
    
    for e in ledger.all_entries:
        if not isinstance(e, data.Transaction):
            continue
        for p in e.postings:
            if p.units is None:
                continue
            if p.units.currency != OPERATING_CURRENCY:
                acct_type = p.account.split(":")[0]
                if acct_type == "Income":
                    non_oc_income += -p.units.number
                    if len(non_oc_examples) < 3:
                        non_oc_examples.append(
                            f"  {e.date} {p.account}: {p.units.number} {p.units.currency}"
                        )
                elif acct_type == "Expenses":
                    non_oc_expenses += p.units.number
                    if len(non_oc_examples) < 3:
                        non_oc_examples.append(
                            f"  {e.date} {p.account}: {p.units.number} {p.units.currency}"
                        )
    
    if non_oc_income != 0 or non_oc_expenses != 0:
        print(f"⚠️  Non-{OPERATING_CURRENCY} amounts being summed into totals!")
        print(f"   Non-{OPERATING_CURRENCY} income impact: {float(non_oc_income):,.2f}")
        print(f"   Non-{OPERATING_CURRENCY} expense impact: {float(non_oc_expenses):,.2f}")
        print(f"   Examples:")
        for ex in non_oc_examples:
            print(f"   {ex}")
        print(f"   → These are being added as if they were {OPERATING_CURRENCY}.")
        print(f"     VACHR '5' gets summed as '5.00 USD'. IRAUSD '500' gets summed as '500.00 USD'.")
    else:
        print(f"✅ No multi-currency contamination in Income/Expenses")


# =====================================================================
# BALANCE SHEET VALIDATION
# =====================================================================

def validate_balance_sheet(ledger: FavaLedger):
    print("\n" + "=" * 70)
    print("BALANCE SHEET VALIDATION")
    print("=" * 70)
    
    # --- PATH A: Router replica ---
    print("\n--- Path A: Router Replica ---")
    router_result = _balance_sheet_router_replica(ledger)
    
    # --- PATH B: Pure Fava realization (with currency breakdown) ---
    print("\n--- Path B: Pure Fava Realization (currency breakdown) ---")
    fava_result = _balance_sheet_pure_fava(ledger)
    
    # --- PATH C: BQL ---
    print("\n--- Path C: BQL Cross-Check ---")
    bql_result = _balance_sheet_bql(ledger)

    # --- COMPARE ---
    print("\n--- COMPARISON ---")
    print(f"{'Method':<25} {'Assets':>15} {'Liabilities':>15} {'Equity':>15} {'A+L+E':>15}")
    print("-" * 85)
    for name, res in [("A) Router Replica", router_result),
                       ("B) Pure Fava", fava_result),
                       ("C) BQL", bql_result)]:
        eq = res["assets"] + res["liabilities"] + res["equity"]
        print(f"{name:<25} {res['assets']:>15.2f} {res['liabilities']:>15.2f} {res['equity']:>15.2f} {eq:>15.2f}")
    
    # Check accounting equation
    eq = router_result["assets"] + router_result["liabilities"] + router_result["equity"]
    if abs(eq) < 0.01:
        print(f"\n✅ Accounting equation holds (A + L + E = {eq:.2f} ≈ 0)")
    else:
        print(f"\n❌ ACCOUNTING EQUATION VIOLATED: A + L + E = {eq:.2f} (should be 0!)")
    
    # Multi-currency check
    print("\n--- Multi-Currency Check ---")
    _check_multicurrency_balance(ledger)
    
    return router_result


def _balance_sheet_router_replica(ledger: FavaLedger) -> dict:
    """Exact replica of reports.py get_balance_sheet()."""
    closed = summarize.cap_opt(ledger.all_entries, ledger.options)
    real_root = realization.realize(closed)
    
    def section_total(root_type: str) -> float:
        node = realization.get(real_root, root_type)
        if node is None:
            return 0.0
        bal = realization.compute_balance(node)
        total = Decimal(0)
        for pos in bal:
            total += pos.units.number
        return decimal_to_report_number(total)
    
    assets = section_total("Assets")
    liabilities = section_total("Liabilities")
    equity = section_total("Equity")
    
    print(f"  Assets: {assets:,.2f}")
    print(f"  Liabilities: {liabilities:,.2f}")
    print(f"  Equity: {equity:,.2f}")
    print(f"  A + L + E = {assets + liabilities + equity:.2f}")
    
    return {"assets": assets, "liabilities": liabilities, "equity": equity}


def _balance_sheet_pure_fava(ledger: FavaLedger) -> dict:
    """Realization with full currency breakdown."""
    closed = summarize.cap_opt(ledger.all_entries, ledger.options)
    real_root = realization.realize(closed)
    
    def sum_by_currency(root_type: str) -> dict[str, Decimal]:
        node = realization.get(real_root, root_type)
        if node is None:
            return {}
        bal = realization.compute_balance(node)
        by_curr: dict[str, Decimal] = {}
        for pos in bal:
            c = pos.units.currency
            by_curr[c] = by_curr.get(c, Decimal(0)) + pos.units.number
        return by_curr
    
    for root_type in ["Assets", "Liabilities", "Equity"]:
        by_curr = sum_by_currency(root_type)
        print(f"  {root_type}:")
        for curr, val in sorted(by_curr.items()):
            print(f"    {curr}: {float(val):,.2f}")
    
    # Sum all (what router does)
    assets_all = sum(sum_by_currency("Assets").values())
    liab_all = sum(sum_by_currency("Liabilities").values())
    eq_all = sum(sum_by_currency("Equity").values())
    
    # USD only
    assets_usd = float(sum_by_currency("Assets").get(OPERATING_CURRENCY, Decimal(0)))
    liab_usd = float(sum_by_currency("Liabilities").get(OPERATING_CURRENCY, Decimal(0)))
    eq_usd = float(sum_by_currency("Equity").get(OPERATING_CURRENCY, Decimal(0)))
    
    print(f"\n  {OPERATING_CURRENCY}-only: A={assets_usd:,.2f} L={liab_usd:,.2f} E={eq_usd:,.2f} Sum={assets_usd+liab_usd+eq_usd:.2f}")
    print(f"  All-currencies: A={float(assets_all):,.2f} L={float(liab_all):,.2f} E={float(eq_all):,.2f} Sum={float(assets_all+liab_all+eq_all):.2f}")
    
    return {
        "assets": float(assets_all),
        "liabilities": float(liab_all),
        "equity": float(eq_all),
    }


def _balance_sheet_bql(ledger: FavaLedger) -> dict:
    """BQL-based balance sheet verification."""
    results = {}
    for root_type in ["Assets", "Liabilities", "Equity"]:
        query = f"SELECT sum(position) AS total WHERE account ~ '^{root_type}:' OR account = '{root_type}'"
        result_types, result_rows = bql.run_query(
            ledger.all_entries, ledger.options, query
        )
        total = Decimal(0)
        if result_rows and not result_rows[0][0].is_empty():
            inv = result_rows[0][0]
            for pos in inv:
                total += pos.units.number
        results[root_type.lower()] = float(total)
        print(f"  {root_type}: {float(total):,.2f}")
    
    return results


def _check_multicurrency_balance(ledger: FavaLedger):
    """Check for multi-currency contamination in balance sheet."""
    closed = summarize.cap_opt(ledger.all_entries, ledger.options)
    real_root = realization.realize(closed)
    
    non_oc_positions = []
    for root_type in ["Assets", "Liabilities", "Equity"]:
        node = realization.get(real_root, root_type)
        if node is None:
            continue
        for child in realization.iter_children(node):
            if not child.account:
                continue
            bal = realization.compute_balance(child)
            for pos in bal:
                if pos.units.currency != OPERATING_CURRENCY and pos.units.number != 0:
                    non_oc_positions.append({
                        "account": child.account,
                        "amount": pos.units.number,
                        "currency": pos.units.currency,
                    })
    
    if non_oc_positions:
        print(f"⚠️  Non-{OPERATING_CURRENCY} positions in balance sheet:")
        for p in non_oc_positions[:10]:
            print(f"   {p['account']}: {float(p['amount']):,.2f} {p['currency']}")
        
        # Calculate impact
        total_impact = sum(float(p["amount"]) for p in non_oc_positions)
        print(f"\n   Total non-{OPERATING_CURRENCY} amount mixed into totals: {total_impact:,.2f}")
        print(f"   These are being treated as {OPERATING_CURRENCY} in the router!")
    else:
        print(f"✅ No multi-currency contamination in Balance Sheet")


# =====================================================================
# DETAILED ACCOUNT BREAKDOWN
# =====================================================================

def print_detailed_breakdown(ledger: FavaLedger):
    """Print detailed account-level data for manual inspection."""
    print("\n" + "=" * 70)
    print("DETAILED ACCOUNT BREAKDOWN (Top accounts, USD only)")
    print("=" * 70)
    
    closed = summarize.cap_opt(ledger.all_entries, ledger.options)
    real_root = realization.realize(closed)
    
    for root_type in ["Assets", "Liabilities", "Equity", "Income", "Expenses"]:
        node = realization.get(real_root, root_type)
        if node is None:
            continue
        
        print(f"\n  {root_type}:")
        accounts = []
        for child in realization.iter_children(node):
            if not child.account or child.account == root_type:
                continue
            bal = realization.compute_balance(child)
            for pos in bal:
                if pos.units.currency == OPERATING_CURRENCY:
                    accounts.append((child.account, float(pos.units.number)))
        
        # Show leaf accounts (no double-counting from parent aggregation)
        leaf_accounts = []
        for acct, val in accounts:
            is_parent = any(
                other_acct.startswith(acct + ":") 
                for other_acct, _ in accounts 
                if other_acct != acct
            )
            if not is_parent and abs(val) > 0.01:
                leaf_accounts.append((acct, val))
        
        leaf_accounts.sort(key=lambda x: -abs(x[1]))
        for acct, val in leaf_accounts[:8]:
            short = acct.replace(root_type + ":", "")
            print(f"    {short:<45} {val:>12,.2f}")
        if len(leaf_accounts) > 8:
            print(f"    ... and {len(leaf_accounts) - 8} more accounts")


# =====================================================================
# SIGN CONVENTION CHECK
# =====================================================================

def validate_sign_conventions(ledger: FavaLedger):
    """Check that signs are handled correctly in the API response shape."""
    print("\n" + "=" * 70)
    print("SIGN CONVENTION ANALYSIS")
    print("=" * 70)
    
    print("""
  Beancount's internal convention:
    - Assets:      positive (debit)
    - Expenses:    positive (debit)  
    - Income:      NEGATIVE (credit)
    - Liabilities: NEGATIVE (credit)
    - Equity:      NEGATIVE (credit)
  
  What users expect to see in reports:
    - Income Statement: Income positive, Expenses positive, Net = Income - Expenses
    - Balance Sheet: Assets positive, Liabilities positive, Equity positive
    
  What the router currently does:
    - Income Statement: negates Income (correct ✅), doesn't negate Expenses (correct ✅)
    - Balance Sheet: does NOT negate Liabilities or Equity (they show as negative!)
    """)
    
    closed = summarize.cap_opt(ledger.all_entries, ledger.options)
    real_root = realization.realize(closed)
    
    # Check what the user actually sees
    for root_type in ["Assets", "Liabilities", "Equity"]:
        node = realization.get(real_root, root_type)
        if node is None:
            continue
        bal = realization.compute_balance(node)
        for pos in bal:
            if pos.units.currency == OPERATING_CURRENCY:
                raw = float(pos.units.number)
                print(f"  {root_type} raw value: {raw:,.2f}")
                if root_type in ("Liabilities", "Equity"):
                    print(f"    → User sees: {raw:,.2f} (negative! Should the front negate?)")
                    print(f"    → Router passes negate=False to build_balance_tree")


# =====================================================================
# MAIN
# =====================================================================

if __name__ == "__main__":
    ledger = load_ledger()
    
    validate_income_statement(ledger)
    validate_balance_sheet(ledger)
    validate_sign_conventions(ledger)
    print_detailed_breakdown(ledger)
    
    print("\n" + "=" * 70)
    print("VALIDATION COMPLETE")
    print("=" * 70)
