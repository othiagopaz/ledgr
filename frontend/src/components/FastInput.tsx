import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountNames, fetchPayees, fetchTags, fetchSuggestions } from "../api/client";
import { useAppStore } from "../stores/appStore";
import { parseInput, type ActiveTrigger } from "../utils/fastInputParser";
import type { TransactionDraft, DraftPosting } from "../types";

interface Pill {
  type: 'payee' | 'amount' | 'accounts' | 'date' | 'tag' | 'link' | 'flag';
  label: string;
  value: string;
  secondary?: string; // for accounts: payment account
}

interface FastInputProps {
  draft: TransactionDraft;
  onDraftChange: (draft: TransactionDraft) => void;
  operatingCurrency: string;
}

let nextPostingId = 100;

export default function FastInput({ draft, onDraftChange, operatingCurrency }: FastInputProps) {
  const defaultPaymentAccount = useAppStore((s) => s.defaultPaymentAccount);

  const [inputValue, setInputValue] = useState("");
  const [pills, setPills] = useState<Pill[]>([]);
  const [dropdownItems, setDropdownItems] = useState<string[]>([]);
  const [dropdownActiveIdx, setDropdownActiveIdx] = useState(-1);
  const [dropdownLabel, setDropdownLabel] = useState<string | null>(null);
  const [accountStep, setAccountStep] = useState<'idle' | 'first' | 'second'>('idle');
  const [firstAccount, setFirstAccount] = useState<string | null>(null);
  const [inputBeforeStep2, setInputBeforeStep2] = useState(""); // narration preserved across step 2
  const [ghostPills, setGhostPills] = useState<Pill[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const accountNamesQ = useQuery({ queryKey: ["account-names"], queryFn: fetchAccountNames });
  const payeesQ = useQuery({ queryKey: ["payees"], queryFn: fetchPayees });
  const tagsQ = useQuery({ queryKey: ["tags"], queryFn: fetchTags });

  const accountNames = accountNamesQ.data?.accounts || [];
  const payeeList = payeesQ.data?.payees || [];
  const tagList = tagsQ.data?.tags || [];

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Sync pills → draft whenever pills change
  useEffect(() => {
    const allPills = [...pills, ...ghostPills.filter(gp => !pills.some(p => p.type === gp.type))];
    const payeePill = allPills.find(p => p.type === 'payee');
    const amountPill = allPills.find(p => p.type === 'amount');
    const accountsPill = allPills.find(p => p.type === 'accounts');
    const datePill = allPills.find(p => p.type === 'date');
    const flagPill = allPills.find(p => p.type === 'flag');
    const tagPills = allPills.filter(p => p.type === 'tag');
    const linkPills = allPills.filter(p => p.type === 'link');

    // Parse narration from current input (non-trigger text)
    const parseResult = parseInput(inputValue, inputValue.length);
    const narration = parseResult.narration;

    const postings: DraftPosting[] = [];
    if (accountsPill) {
      postings.push({
        id: nextPostingId++,
        account: accountsPill.value,
        amount: amountPill?.value || '',
        currency: operatingCurrency,
        cost: '', costCurrency: '', price: '', priceCurrency: '',
      });
      // Always add the second posting — even if payment account is empty,
      // validation will catch the missing account on submit
      const paymentAcct = accountsPill.secondary || defaultPaymentAccount || '';
      postings.push({
        id: nextPostingId++,
        account: paymentAcct,
        amount: '',
        currency: operatingCurrency,
        cost: '', costCurrency: '', price: '', priceCurrency: '',
      });
    }

    onDraftChange({
      date: datePill?.value || new Date().toISOString().slice(0, 10),
      flag: flagPill ? '!' : '*',
      payee: payeePill?.value || '',
      narration,
      tags: tagPills.map(p => p.value),
      links: linkPills.map(p => p.value),
      postings,
    });
  }, [pills, ghostPills, inputValue, operatingCurrency, defaultPaymentAccount, onDraftChange]);

  // Parse input for active trigger and update dropdown
  const updateDropdown = useCallback((text: string, cursor: number) => {
    // If we're in account step 2, show payment account dropdown
    if (accountStep === 'second') {
      const query = text.trim();
      const filtered = accountNames
        .filter(a => a.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 15);
      setDropdownItems(filtered);
      setDropdownLabel("Pay from...");
      setDropdownActiveIdx(-1);
      return;
    }

    const result = parseInput(text, cursor);
    const trigger = result.activeTrigger;

    if (!trigger) {
      setDropdownItems([]);
      setDropdownLabel(null);
      return;
    }

    let items: string[] = [];
    let label: string | null = null;

    switch (trigger.type) {
      case 'account':
        items = accountNames.filter(a => a.toLowerCase().includes(trigger.query.toLowerCase())).slice(0, 15);
        label = "Expense account";
        break;
      case 'payee':
        items = payeeList.filter(p => p.toLowerCase().includes(trigger.query.toLowerCase())).slice(0, 15);
        label = "Payee";
        break;
      case 'tag':
        items = tagList.filter(t => t.toLowerCase().includes(trigger.query.toLowerCase())).slice(0, 15);
        label = "Tag";
        break;
      case 'amount':
      case 'link':
        // No dropdown for these
        setDropdownItems([]);
        setDropdownLabel(null);
        return;
    }

    setDropdownItems(items);
    setDropdownLabel(label);
    setDropdownActiveIdx(-1);
  }, [accountNames, payeeList, tagList, accountStep]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setInputValue(text);
    const cursor = e.target.selectionStart || text.length;
    updateDropdown(text, cursor);
  }

  function removeTriggerFromInput(triggerChar: string) {
    // Remove the trigger token (triggerChar + following non-space chars) from input
    const re = new RegExp(`\\${triggerChar}\\S*\\s?`);
    setInputValue(prev => prev.replace(re, '').trim());
  }

  function selectDropdownItem(item: string) {
    if (accountStep === 'second') {
      // Second account selected — update existing accounts pill
      setPills(prev => prev.map(p =>
        p.type === 'accounts' ? { ...p, label: `${shortName(firstAccount!)} → ${shortName(item)}`, secondary: item } : p
      ));
      setAccountStep('idle');
      setFirstAccount(null);
      // Restore narration that was in the input before step 2
      setInputValue(inputBeforeStep2);
      setDropdownItems([]);
      setDropdownLabel(null);
      inputRef.current?.focus();
      return;
    }

    const result = parseInput(inputValue, inputRef.current?.selectionStart || inputValue.length);
    const trigger = result.activeTrigger;
    if (!trigger) return;

    switch (trigger.type) {
      case 'account': {
        // First account selected (expense / "from")
        const existing = pills.findIndex(p => p.type === 'accounts');
        removeTriggerFromInput('>');

        if (defaultPaymentAccount) {
          // Default payment account is set — skip step 2, use it directly
          const newPill: Pill = {
            type: 'accounts',
            label: `${shortName(item)} → ${shortName(defaultPaymentAccount)}`,
            value: item,
            secondary: defaultPaymentAccount,
          };
          if (existing >= 0) {
            setPills(prev => [...prev.slice(0, existing), newPill, ...prev.slice(existing + 1)]);
          } else {
            setPills(prev => [...prev, newPill]);
          }
          break;
        }

        // No default — open 2nd dropdown for "pay from"
        const newPill: Pill = { type: 'accounts', label: shortName(item), value: item, secondary: '' };
        if (existing >= 0) {
          setPills(prev => [...prev.slice(0, existing), newPill, ...prev.slice(existing + 1)]);
        } else {
          setPills(prev => [...prev, newPill]);
        }
        setFirstAccount(item);
        setAccountStep('second');
        // Save narration before step 2 replaces input with filter text
        setInputBeforeStep2(inputValue.replace(/>\S*/g, '').replace(/\s+/g, ' ').trim());
        setInputValue('');
        setDropdownItems(accountNames.slice(0, 15));
        setDropdownLabel("Pay from...");
        setDropdownActiveIdx(-1);
        setTimeout(() => inputRef.current?.focus(), 0);
        return; // Return early — don't let the cleanup below clear the dropdown
      }
      case 'payee': {
        const existing = pills.findIndex(p => p.type === 'payee');
        const newPill: Pill = { type: 'payee', label: `@ ${item}`, value: item };
        if (existing >= 0) {
          setPills(prev => [...prev.slice(0, existing), newPill, ...prev.slice(existing + 1)]);
        } else {
          setPills(prev => [...prev, newPill]);
        }
        removeTriggerFromInput('@');
        // Auto-suggest account/amount based on payee
        fetchSuggestionsForPayee(item);
        break;
      }
      case 'tag': {
        if (!pills.some(p => p.type === 'tag' && p.value === item)) {
          setPills(prev => [...prev, { type: 'tag', label: `# ${item}`, value: item }]);
        }
        removeTriggerFromInput('#');
        break;
      }
    }

    setDropdownItems([]);
    setDropdownLabel(null);
    inputRef.current?.focus();
  }

  async function fetchSuggestionsForPayee(payee: string) {
    try {
      const suggestion = await fetchSuggestions(payee);
      const newGhosts: Pill[] = [];
      if (suggestion.account && !pills.some(p => p.type === 'accounts')) {
        newGhosts.push({
          type: 'accounts',
          label: shortName(suggestion.account),
          value: suggestion.account,
          secondary: defaultPaymentAccount || '',
        });
      }
      if (suggestion.amount && !pills.some(p => p.type === 'amount')) {
        newGhosts.push({
          type: 'amount',
          label: `$ ${suggestion.amount}`,
          value: suggestion.amount,
        });
      }
      setGhostPills(newGhosts);
    } catch {
      // Ignore suggestion errors
    }
  }

  function acceptGhostPill(ghost: Pill) {
    setPills(prev => [...prev, ghost]);
    setGhostPills(prev => prev.filter(p => p !== ghost));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Dropdown navigation
    if (dropdownItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDropdownActiveIdx(i => Math.min(i + 1, dropdownItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDropdownActiveIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && dropdownActiveIdx >= 0) {
        e.preventDefault();
        e.stopPropagation();
        selectDropdownItem(dropdownItems[dropdownActiveIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // Don't let modal close while dropdown is open
        if (accountStep === 'second') {
          // Use default payment account if available, otherwise leave secondary empty
          if (defaultPaymentAccount) {
            setPills(prev => prev.map(p =>
              p.type === 'accounts' ? { ...p, label: `${shortName(firstAccount!)} → ${shortName(defaultPaymentAccount)}`, secondary: defaultPaymentAccount } : p
            ));
          }
          setAccountStep('idle');
          setFirstAccount(null);
          setInputValue(inputBeforeStep2);
        }
        setDropdownItems([]);
        setDropdownLabel(null);
        return;
      }
    }

    // Parse inline tokens on space (for $amount, #tag, @payee without dropdown)
    if (e.key === ' ') {
      processInlineTokens();
    }

    // Allow Enter to accept free-text payee when typing @query but no dropdown item selected
    if (e.key === 'Enter' && dropdownItems.length === 0) {
      // Check if there's a @payee token in the input
      const result = parseInput(inputValue, inputRef.current?.selectionStart || inputValue.length);
      if (result.activeTrigger?.type === 'payee' && result.activeTrigger.query) {
        e.preventDefault();
        e.stopPropagation();
        acceptFreeTextPayee(result.activeTrigger.query);
        return;
      }
    }
  }

  function acceptFreeTextPayee(name: string) {
    const existing = pills.findIndex(p => p.type === 'payee');
    const newPill: Pill = { type: 'payee', label: `@ ${name}`, value: name };
    if (existing >= 0) {
      setPills(prev => [...prev.slice(0, existing), newPill, ...prev.slice(existing + 1)]);
    } else {
      setPills(prev => [...prev, newPill]);
    }
    removeTriggerFromInput('@');
    setDropdownItems([]);
    setDropdownLabel(null);
    fetchSuggestionsForPayee(name);
  }

  function processInlineTokens() {
    const result = parseInput(inputValue, inputValue.length);

    // Handle @payee free text (not just from dropdown)
    if (result.activeTrigger?.type === 'payee' && result.activeTrigger.query) {
      acceptFreeTextPayee(result.activeTrigger.query);
    }

    for (const token of result.tokens) {
      switch (token.type) {
        case 'amount': {
          const existing = pills.findIndex(p => p.type === 'amount');
          const newPill: Pill = { type: 'amount', label: `$ ${token.value}`, value: token.value };
          if (existing >= 0) {
            setPills(prev => [...prev.slice(0, existing), newPill, ...prev.slice(existing + 1)]);
          } else {
            setPills(prev => [...prev, newPill]);
          }
          // Remove token from input
          setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
          break;
        }
        case 'date': {
          const existing = pills.findIndex(p => p.type === 'date');
          const newPill: Pill = { type: 'date', label: token.raw, value: token.value };
          if (existing >= 0) {
            setPills(prev => [...prev.slice(0, existing), newPill, ...prev.slice(existing + 1)]);
          } else {
            setPills(prev => [...prev, newPill]);
          }
          setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
          break;
        }
        case 'flag': {
          const existing = pills.findIndex(p => p.type === 'flag');
          if (existing >= 0) {
            // Toggle off
            setPills(prev => prev.filter((_, i) => i !== existing));
          } else {
            setPills(prev => [...prev, { type: 'flag', label: '! planned', value: '!' }]);
          }
          setInputValue(prev => prev.replace('!', '').replace(/\s+/g, ' ').trim());
          break;
        }
        case 'link': {
          if (!pills.some(p => p.type === 'link' && p.value === token.value)) {
            setPills(prev => [...prev, { type: 'link', label: `^ ${token.value}`, value: token.value }]);
          }
          setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
          break;
        }
        case 'tag': {
          // Tags typed inline (without dropdown) — consume on space
          if (!pills.some(p => p.type === 'tag' && p.value === token.value)) {
            setPills(prev => [...prev, { type: 'tag', label: `# ${token.value}`, value: token.value }]);
          }
          setInputValue(prev => prev.replace(token.raw, '').replace(/\s+/g, ' ').trim());
          break;
        }
      }
    }
    // Clear ghost pills when user overrides with manual input
    setGhostPills(prev => prev.filter(gp => !pills.some(p => p.type === gp.type)));
  }

  function removePill(index: number) {
    setPills(prev => prev.filter((_, i) => i !== index));
  }

  const pillColorClass: Record<Pill['type'], string> = {
    payee: 'pill-blue',
    amount: 'pill-green',
    accounts: 'pill-purple',
    date: 'pill-amber',
    tag: 'pill-teal',
    link: 'pill-pink',
    flag: 'pill-coral',
  };

  const hasContent = pills.length > 0 || inputValue.length > 0;

  return (
    <div className="fast-input">
      {/* Input */}
      <div className="fast-input-field">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type narration, use $ > @ # ^ ! for fields..."
          className="fast-input-text"
          autoComplete="off"
        />

        {/* Dropdown */}
        {dropdownItems.length > 0 && (
          <div className="fast-input-dropdown" ref={dropdownRef}>
            {dropdownLabel && <div className="fast-input-dropdown-label">{dropdownLabel}</div>}
            {dropdownItems.map((item, i) => (
              <div
                key={item}
                className={`fast-input-dropdown-item${i === dropdownActiveIdx ? ' active' : ''}`}
                onMouseDown={() => selectDropdownItem(item)}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pills bar */}
      {(pills.length > 0 || ghostPills.length > 0) && (
        <div className="fast-input-pills">
          {pills.map((pill, i) => (
            <span key={`${pill.type}-${pill.value}-${i}`} className={`fast-pill ${pillColorClass[pill.type]}`}>
              {pill.label}
              <button type="button" onClick={() => removePill(i)}>&times;</button>
            </span>
          ))}
          {ghostPills.map((ghost, i) => (
            <span
              key={`ghost-${ghost.type}-${i}`}
              className={`fast-pill ${pillColorClass[ghost.type]} ghost-pill`}
              onClick={() => acceptGhostPill(ghost)}
              title="Click to accept suggestion"
            >
              {ghost.label}
            </span>
          ))}
        </div>
      )}

      {/* Helper cheatsheet */}
      <div className={`fast-input-helper${hasContent ? ' faded' : ''}`}>
        <div className="helper-grid">
          <span><kbd>$</kbd> amount</span>
          <span><kbd>@</kbd> payee</span>
          <span><kbd>&gt;</kbd> accounts</span>
          <span><kbd>#</kbd> tag</span>
          <span><kbd>!</kbd> planned</span>
          <span><kbd>^</kbd> link</span>
        </div>
        <div className="helper-dates">dates: today, yesterday, tomorrow, DD/MM</div>
      </div>
    </div>
  );
}

function shortName(account: string): string {
  const parts = account.split(':');
  return parts.length > 2 ? parts.slice(-2).join(':') : parts[parts.length - 1];
}
