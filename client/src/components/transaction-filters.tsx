import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { CreateTransactionSheet } from "./create-transaction-sheet";

// Define TransactionType locally or import it if defined elsewhere

interface TransactionFiltersProps {
  accountOptions: string[];
  categoryOptions: string[];
  selectedAccount: string | undefined;
  setSelectedAccount: (value: string | undefined) => void;
  selectedCategory: string | undefined;
  setSelectedCategory: (value: string | undefined) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}

export function TransactionFilters({
  accountOptions,
  categoryOptions,
  selectedAccount,
  setSelectedAccount,
  selectedCategory,
  setSelectedCategory,
  searchTerm,
  setSearchTerm,
}: TransactionFiltersProps) {
  // Removed specific handlers, modal will handle creation logic

  return (
    <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      {/* Filter Selects & Search (Left/Center - Expand) */}
      <div className="flex w-full flex-col items-start gap-4 sm:flex-1 sm:flex-row sm:items-center sm:gap-2">
        {/* Filter Selects - Allow to grow */}
        <div className="flex flex-wrap gap-2 sm:flex-grow">
          <Select
            value={selectedAccount ?? "all"}
            onValueChange={(value) =>
              setSelectedAccount(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="min-w-[150px] flex-1 sm:flex-1">
              <SelectValue placeholder="Conta/Cartão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {accountOptions.map((acc) => (
                <SelectItem key={acc} value={acc}>
                  {acc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedCategory ?? "all"}
            onValueChange={(value) =>
              setSelectedCategory(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="min-w-[150px] flex-1 sm:flex-1">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Search Input - Allow to grow */}
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Pesquisar transações..."
            className="w-full rounded-lg bg-background pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Reverted to two separate buttons triggering the sheet */}
      <div className="flex w-full flex-shrink-0 gap-2 sm:w-auto">
        {/* Income Button */}
        <CreateTransactionSheet initialType="INCOME">
          <Button className="flex-1 bg-green-900 text-white hover:bg-green-950 sm:flex-initial">
            <Plus className="mr-1 h-4 w-4" />
            Receita
          </Button>
        </CreateTransactionSheet>

        {/* Expense Button */}
        <CreateTransactionSheet initialType="EXPENSE">
          <Button className="flex-1 bg-red-900 text-white hover:bg-red-950 sm:flex-initial">
            <Plus className="mr-1 h-4 w-4" />
            Despesa
          </Button>
        </CreateTransactionSheet>
      </div>
    </div>
  );
}
