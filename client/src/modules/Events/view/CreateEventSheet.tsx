import { useState, useEffect } from "react";
import {
  IconPlus,
  IconCircleCheckFilled,
  IconBuildingBank,
  IconCreditCard,
} from "@tabler/icons-react";
import { NumericFormat } from "react-number-format";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCreateEvent } from "../viewmodel/useCreateEvent";
import {
  CreateEventDto,
  TransactionStatus,
  Ownership,
} from "../model/event.types";
import { TransactionType } from "@/modules/Category/model/category.types";
import { useAppContext } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { FinancialInstrument } from "@/modules/FinancialInstrument/model/financial-instrument.types";

export const CreateEventSheet = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { createEvent, isLoading, error } = useCreateEvent();
  const { categories, financialInstruments } = useAppContext();
  const [formData, setFormData] = useState<CreateEventDto>({
    description: "",
    date: "",
    categoryId: "",
    transactions: [],
  });
  const [amount, setAmount] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [transactionType, setTransactionType] = useState<TransactionType>(
    TransactionType.EXPENSE
  );
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Set default account when sheet opens
  useEffect(() => {
    if (isOpen && !selectedAccount) {
      const defaultAccount = financialInstruments.financialInstruments.find(
        (account) => account.isDefault
      );
      if (defaultAccount) {
        setSelectedAccount(defaultAccount.id);
      }
    }
  }, [isOpen, financialInstruments.financialInstruments, selectedAccount]);

  console.log("Categories from context:", categories);
  console.log("Transaction type:", transactionType);

  const filteredCategories = categories.categories.filter(
    (group) => group.type === transactionType
  );

  console.log("Filtered categories:", filteredCategories);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const numericAmount = parseInt(amount.replace(".", ""));
      await createEvent({
        ...formData,
        categoryId: selectedCategory,
        transactions: [
          {
            amount: numericAmount,
            installmentNumber: 1,
            dueDate: formData.date,
            competenceDate: formData.date,
            status: TransactionStatus.PENDING,
            ownership: Ownership.OWN,
            type: TransactionType.EXPENSE,
            accountId: selectedAccount,
          },
        ],
      });
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to create event:", err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case "ACCOUNT":
        return <IconBuildingBank className="mr-2 h-4 w-4" />;
      case "CREDIT_CARD":
        return <IconCreditCard className="mr-2 h-4 w-4" />;
      default:
        return null;
    }
  };

  const getSelectedAccount = () => {
    if (!selectedAccount) return null;
    const account = financialInstruments.financialInstruments.find(
      (acc) => acc.id === selectedAccount
    );
    if (!account) return null;
    return (
      <>
        {getAccountIcon(account.type)}
        {account.name}
      </>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="default" size="sm">
          <IconPlus className="h-4 w-4" />
          <span className="hidden lg:inline">Add Event</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-[100%] lg:max-w-[50%] md:max-w-[75%]">
        <SheetHeader className="px-6">
          <SheetTitle>Create New Event</SheetTitle>
          <SheetDescription>
            Create a new event to track your expenses or incomes.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-6 px-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Basic Information</h3>
              <div className="flex items-center space-x-2">
                <Label htmlFor="transaction-type">Income</Label>
                <Switch
                  id="transaction-type"
                  checked={transactionType === TransactionType.EXPENSE}
                  onCheckedChange={(checked) =>
                    setTransactionType(
                      checked ? TransactionType.EXPENSE : TransactionType.INCOME
                    )
                  }
                />
                <Label htmlFor="transaction-type">Expense</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="w-full">
                  <NumericFormat
                    id="amount"
                    name="amount"
                    placeholder="R$ 0,00"
                    value={amount}
                    onValueChange={(values) => setAmount(values.value)}
                    thousandSeparator="."
                    decimalSeparator=","
                    decimalScale={2}
                    fixedDecimalScale
                    prefix="R$ "
                    className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive w-full"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={
                    formData.date || new Date().toISOString().split("T")[0]
                  }
                  onChange={handleChange}
                  className="w-full"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={open}
                      className="w-full justify-between font-normal"
                    >
                      {categories.isLoading
                        ? "Loading categories..."
                        : selectedCategory
                        ? filteredCategories
                            .flatMap((group) => group.subcategories)
                            .find((option) => option.id === selectedCategory)
                            ?.name
                        : "Select category..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Search categories..." />
                      <CommandList>
                        {categories.isLoading ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            Loading categories...
                          </div>
                        ) : filteredCategories.length === 0 ? (
                          <CommandEmpty>No categories found.</CommandEmpty>
                        ) : (
                          filteredCategories.map((group) => (
                            <CommandGroup key={group.id} heading={group.name}>
                              {group.subcategories.map((subcategory) => (
                                <CommandItem
                                  key={subcategory.id}
                                  value={subcategory.name}
                                  onSelect={() => {
                                    setSelectedCategory(subcategory.id);
                                    setOpen(false);
                                  }}
                                >
                                  <div
                                    className={cn(
                                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                      selectedCategory === subcategory.id
                                        ? "bg-primary text-primary-foreground"
                                        : "opacity-50 [&_svg]:invisible"
                                    )}
                                  >
                                    <IconCircleCheckFilled className="h-3 w-3" />
                                  </div>
                                  {subcategory.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ))
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account">Account</Label>
                <Popover open={accountOpen} onOpenChange={setAccountOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={accountOpen}
                      className="w-full justify-start font-normal"
                    >
                      {financialInstruments.isLoading
                        ? "Loading accounts..."
                        : selectedAccount
                        ? getSelectedAccount()
                        : "Select account..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Search accounts..." />
                      <CommandList>
                        {financialInstruments.isLoading ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            Loading accounts...
                          </div>
                        ) : financialInstruments.financialInstruments.length ===
                          0 ? (
                          <CommandEmpty>No accounts found.</CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {financialInstruments.financialInstruments.map(
                              (account: FinancialInstrument) => (
                                <CommandItem
                                  key={account.id}
                                  value={account.name}
                                  onSelect={() => {
                                    setSelectedAccount(account.id);
                                    setAccountOpen(false);
                                  }}
                                >
                                  <div
                                    className={cn(
                                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                      selectedAccount === account.id
                                        ? "bg-primary text-primary-foreground"
                                        : "opacity-50 [&_svg]:invisible"
                                    )}
                                  >
                                    <IconCircleCheckFilled className="h-3 w-3" />
                                  </div>
                                  {getAccountIcon(account.type)}
                                  {account.name}
                                </CommandItem>
                              )
                            )}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <SheetFooter className="px-0">
            <SheetClose asChild>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Event"}
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
