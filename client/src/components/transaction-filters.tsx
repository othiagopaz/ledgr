import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Search, Plus } from "lucide-react";
import { CreateTransactionSheet } from "./create-transaction-sheet";
import { FinancialInstrument, Category } from "@/services/api";
import { mapCategoriesToSelectOptions, CategoryGroup } from "@/utils/mappers";
import { cn } from "@/lib/utils";

// Define TransactionType here if not imported globally
type TransactionType = "INCOME" | "EXPENSE" | "TRANSFERENCE";

interface TransactionFiltersProps {
  financialInstruments: FinancialInstrument[];
  isLoadingInstruments: boolean;
  instrumentsError: string | null;
  // Receive raw categories and selected type
  rawCategories: Category[];
  isLoadingCategories: boolean;
  categoriesError: string | null;
  selectedType: TransactionType | undefined;
  // Update account selection types
  selectedAccount: string[];
  setSelectedAccount: (value: string[]) => void;
  // Update category selection types
  selectedCategory: string[];
  setSelectedCategory: (value: string[]) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
}

export function TransactionFilters({
  financialInstruments,
  isLoadingInstruments,
  instrumentsError,
  // Destructure raw categories and selectedType
  rawCategories,
  isLoadingCategories,
  categoriesError,
  selectedType,
  selectedAccount,
  setSelectedAccount,
  selectedCategory,
  setSelectedCategory,
  searchTerm,
  setSearchTerm,
}: TransactionFiltersProps) {
  // State for Combobox open state
  const [categoryPopoverOpen, setCategoryPopoverOpen] = React.useState(false);
  // Add state for account combobox
  const [accountPopoverOpen, setAccountPopoverOpen] = React.useState(false);

  // Filter and map categories based on selectedType
  const displayCategoryOptions = React.useMemo(() => {
    if (!rawCategories) return [];

    // Filter by type if a specific type (INCOME/EXPENSE) is selected
    const filteredCategories =
      selectedType && (selectedType === "INCOME" || selectedType === "EXPENSE")
        ? rawCategories.filter((cat) => cat.type === selectedType)
        : rawCategories; // Use all if no type or 'TRANSFERENCE' is selected

    // Map the filtered categories to Select options
    return mapCategoriesToSelectOptions(filteredCategories);
  }, [rawCategories, selectedType]); // Recalculate when raw data or filter type changes

  // Selected category name/count for display
  const selectedCategoryDisplay = React.useMemo(() => {
    if (selectedCategory.length === 0) return null;
    if (selectedCategory.length === 1) {
      for (const group of displayCategoryOptions) {
        const found = group.options.find(
          (opt) => opt.id === selectedCategory[0]
        );
        if (found) return found.name;
      }
    }
    return `${selectedCategory.length} selecionadas`;
  }, [selectedCategory, displayCategoryOptions]);

  return (
    <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      {/* Filter Selects & Search (Left/Center - Expand) */}
      <div className="flex w-full flex-col items-start gap-4 sm:flex-1 sm:flex-row sm:items-center sm:gap-2">
        {/* Filter Selects - Allow to grow */}
        <div className="flex flex-wrap gap-2 sm:flex-grow">
          {/* --- Account/Card Multi-Select Combobox --- */}
          <Popover
            open={accountPopoverOpen}
            onOpenChange={setAccountPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={accountPopoverOpen}
                className="min-w-[150px] flex-1 sm:flex-1 text-left font-normal"
                disabled={isLoadingInstruments || !!instrumentsError}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">
                    {selectedAccount.length === 0
                      ? isLoadingInstruments
                        ? "Carregando..."
                        : instrumentsError
                        ? "Erro"
                        : "Conta/Cartão"
                      : selectedAccount.length === 1
                      ? financialInstruments.find(
                          (inst) => inst.id === selectedAccount[0]
                        )?.name ?? "Conta/Cartão"
                      : `${selectedAccount.length} selecionados`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[--radix-popover-trigger-width]">
              <Command>
                <CommandInput
                  placeholder="Buscar conta/cartão..."
                  className="w-full"
                />
                <CommandList>
                  <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                  {/* Option to clear selection */}
                  <CommandItem
                    key="clear-account"
                    value="__clear_account__"
                    onSelect={() => {
                      setSelectedAccount([]); // Clear the array
                      // Keep popover open? Optional: setAccountPopoverOpen(false);
                    }}
                  >
                    {/* Consider different visual cue for clearing multi-select? */}
                    Limpar Seleção
                  </CommandItem>
                  {financialInstruments.map((instrument) => (
                    <CommandItem
                      key={instrument.id}
                      value={instrument.name} // Filter based on name
                      onSelect={(currentValue: string) => {
                        // Find ID by name (assuming names are unique for filtering)
                        const item = financialInstruments.find(
                          (inst) =>
                            inst.name.toLowerCase() ===
                            currentValue.toLowerCase()
                        );
                        if (!item) return; // Should not happen if value comes from item

                        // Toggle selection
                        const isSelected = selectedAccount.includes(item.id);
                        if (isSelected) {
                          setSelectedAccount(
                            selectedAccount.filter((id) => id !== item.id)
                          );
                        } else {
                          setSelectedAccount([...selectedAccount, item.id]);
                        }
                      }}
                      // Use flex justify-between on the item itself
                      className="flex items-center justify-between w-full"
                    >
                      {/* Display name and detail on the left */}
                      <div className="flex items-center">
                        <span>{instrument.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {instrument.displayDetail}
                        </span>
                      </div>
                      {/* Check icon on the right */}
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4", // Use ml-2 for spacing
                          selectedAccount.includes(instrument.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {/* Category Combobox */}
          <Popover
            open={categoryPopoverOpen}
            onOpenChange={setCategoryPopoverOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={categoryPopoverOpen}
                className="min-w-[150px] flex-1 sm:flex-1 text-left font-normal"
                disabled={isLoadingCategories || !!categoriesError}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">
                    {selectedCategoryDisplay
                      ? selectedCategoryDisplay
                      : isLoadingCategories
                      ? "Carregando..."
                      : categoriesError
                      ? "Erro"
                      : "Selecione Categoria"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput
                  placeholder="Buscar categoria..."
                  className="w-full"
                />
                <CommandList>
                  <CommandEmpty>
                    Nenhuma categoria encontrada
                    {selectedType === "INCOME"
                      ? " para receitas"
                      : selectedType === "EXPENSE"
                      ? " para despesas"
                      : ""}
                    .
                  </CommandEmpty>

                  {/* Add Clear Selection item at the top */}
                  <CommandItem
                    key="clear-category"
                    value="__clear__"
                    onSelect={() => {
                      setSelectedCategory([]);
                    }}
                    // Add specific styling if needed, or leave default
                  >
                    Limpar Seleção
                  </CommandItem>

                  {/* Render groups and items AFTER clear */}
                  {displayCategoryOptions.map((group: CategoryGroup) => (
                    <CommandGroup key={group.label} heading={group.label}>
                      {group.options.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.name}
                          onSelect={(currentValue: string) => {
                            const selectedItem = displayCategoryOptions
                              .flatMap((g) => g.options)
                              .find(
                                (opt) =>
                                  opt.name.toLowerCase() ===
                                  currentValue.toLowerCase()
                              );
                            if (!selectedItem) return;
                            const isSelected = selectedCategory.includes(
                              selectedItem.id
                            );
                            if (isSelected) {
                              setSelectedCategory(
                                selectedCategory.filter(
                                  (id) => id !== selectedItem.id
                                )
                              );
                            } else {
                              setSelectedCategory([
                                ...selectedCategory,
                                selectedItem.id,
                              ]);
                            }
                          }}
                          className="flex items-center justify-between w-full"
                        >
                          <span>{item.name}</span>
                          <Check
                            className={cn(
                              "ml-2 h-4 w-4",
                              selectedCategory.includes(item.id)
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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

      {/* Pass RAW categories to CreateTransactionSheet */}
      <div className="flex w-full flex-shrink-0 gap-2 sm:w-auto">
        <CreateTransactionSheet
          initialType="INCOME"
          financialInstruments={financialInstruments}
          rawCategories={rawCategories}
        >
          <Button
            className="flex-1 bg-green-900 text-white hover:bg-green-950 sm:flex-initial"
            disabled={isLoadingInstruments || !!instrumentsError} // Disable button if accounts failed
          >
            <Plus className="mr-1 h-4 w-4" />
            Receita
          </Button>
        </CreateTransactionSheet>
        <CreateTransactionSheet
          initialType="EXPENSE"
          financialInstruments={financialInstruments}
          rawCategories={rawCategories}
        >
          <Button
            className="flex-1 bg-red-900 text-white hover:bg-red-950 sm:flex-initial"
            disabled={isLoadingInstruments || !!instrumentsError} // Disable button if accounts failed
          >
            <Plus className="mr-1 h-4 w-4" />
            Despesa
          </Button>
        </CreateTransactionSheet>
      </div>
    </div>
  );
}
