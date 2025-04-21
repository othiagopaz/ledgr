import * as React from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckedState } from "@radix-ui/react-checkbox";
import { cn } from "@/lib/utils";
import { FinancialInstrument, Category } from "@/services/api";
import {
  CategorySelectOption,
  CategoryGroup,
  CategorySelectItem,
  mapCategoriesToSelectOptions,
} from "@/utils/mappers";

type FormTransactionType = "INCOME" | "EXPENSE";

interface CreateTransactionSheetProps {
  children: React.ReactNode;
  initialType: FormTransactionType;
  financialInstruments: FinancialInstrument[];
  rawCategories: Category[];
}

const mockNegotiators = ["Empresa X", "Mercado Y", "Restaurante Z", "Outro"];
const installmentOptions = [
  "À vista",
  ...Array.from({ length: 11 }, (_, i) => `${i + 2}x`),
];

export function CreateTransactionSheet({
  children,
  initialType,
  financialInstruments,
  rawCategories,
}: CreateTransactionSheetProps) {
  const [value, setValue] = React.useState<number | string>("");
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const [category, setCategory] = React.useState<string | undefined>();
  const [negotiator, setNegotiator] = React.useState<string | undefined>();
  const [account, setAccount] = React.useState<string | undefined>();
  const [isPending, setIsPending] = React.useState(false);
  const [paymentDate, setPaymentDate] = React.useState<Date | undefined>(
    new Date()
  );
  const [installmentOption, setInstallmentOption] =
    React.useState<string>("À vista");
  const [accountPopoverOpen, setAccountPopoverOpen] = React.useState(false);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = React.useState(false);

  const displayCategoryOptions = React.useMemo(() => {
    if (!rawCategories) return [];

    const filteredCategories = rawCategories.filter(
      (cat) => cat.type === initialType
    );

    return mapCategoriesToSelectOptions(filteredCategories);
  }, [rawCategories, initialType]);

  const selectedAccountDetails = React.useMemo(() => {
    return financialInstruments.find((inst) => inst.id === account);
  }, [account, financialInstruments]);

  const selectedCategoryName = React.useMemo(() => {
    if (!category) return null;
    for (const group of displayCategoryOptions) {
      const found = group.options.find((opt) => opt.id === category);
      if (found) return found.name;
    }
    return null;
  }, [category, displayCategoryOptions]);

  React.useEffect(() => {
    if (isPending) {
      setPaymentDate(undefined);
    } else if (!paymentDate) {
      setPaymentDate(new Date());
    }
  }, [isPending]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const numericValue =
      typeof value === "string" ? parseFloat(value.replace(",", ".")) : value;
    console.log("Form submitted with state:", {
      transactionType: initialType,
      value: numericValue,
      description,
      date,
      category,
      negotiator,
      account,
      dueDate: date,
      isPaid: !isPending,
      paymentDate: !isPending ? paymentDate : undefined,
      installmentOption,
    });
  };

  const sheetTitle =
    initialType === "INCOME" ? "Criar Nova Receita" : "Criar Nova Despesa";

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:w-[100%] sm:max-w-[75%] xl:w-[50%] xl:max-w-none flex flex-col h-full"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>{sheetTitle}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-grow">
          <div className="flex-grow overflow-y-auto px-6 py-4 space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium leading-none">
                Informações gerais
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div className="grid gap-2">
                  <Label htmlFor="value">Valor (R$)</Label>
                  <Input
                    id="value"
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0,00"
                    className="w-full"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="account-combobox">Conta/Cartão</Label>
                  <Popover
                    open={accountPopoverOpen}
                    onOpenChange={setAccountPopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={accountPopoverOpen}
                        id="account-combobox"
                        className="w-full justify-between text-left font-normal"
                      >
                        <span className="truncate">
                          {selectedAccountDetails
                            ? `${selectedAccountDetails.name} (${selectedAccountDetails.displayDetail})`
                            : "Selecione conta ou cartão"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Buscar conta/cartão..."
                          className="w-full"
                        />
                        <CommandList>
                          <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
                          <CommandItem
                            key="clear-account-sheet"
                            value="__clear_account_sheet__"
                            onSelect={() => {
                              setAccount(undefined);
                              setAccountPopoverOpen(false);
                            }}
                            className="flex items-center justify-between w-full"
                          >
                            <span>Limpar Seleção</span>
                          </CommandItem>
                          {financialInstruments.map((instrument) => (
                            <CommandItem
                              key={instrument.id}
                              value={instrument.name}
                              onSelect={(currentValue: string) => {
                                const selectedItem = financialInstruments.find(
                                  (inst) =>
                                    inst.name.toLowerCase() ===
                                    currentValue.toLowerCase()
                                );
                                setAccount(
                                  selectedItem ? selectedItem.id : undefined
                                );
                                setAccountPopoverOpen(false);
                              }}
                              className="flex items-center justify-between w-full"
                            >
                              <div className="flex items-center">
                                <span>{instrument.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {instrument.displayDetail}
                                </span>
                              </div>
                              <Check
                                className={cn(
                                  "ml-2 h-4 w-4",
                                  account === instrument.id
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
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={`w-full justify-start text-left font-normal ${
                          !date && "text-muted-foreground"
                        }`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? (
                          format(date, "PPP", { locale: ptBR })
                        ) : (
                          <span>Escolha uma data</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Compra no supermercado"
                    className="w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category-combobox">Categoria</Label>
                  <Popover
                    open={categoryPopoverOpen}
                    onOpenChange={setCategoryPopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryPopoverOpen}
                        id="category-combobox"
                        className="w-full justify-between text-left font-normal"
                      >
                        <span className="truncate">
                          {selectedCategoryName ?? "Selecione uma categoria"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                            Nenhuma categoria encontrada para{" "}
                            {initialType === "INCOME" ? "receitas" : "despesas"}
                            .
                          </CommandEmpty>

                          <CommandItem
                            key="clear-category-sheet"
                            value="__clear__sheet__"
                            onSelect={() => {
                              setCategory(undefined);
                              setCategoryPopoverOpen(false);
                            }}
                          >
                            Limpar Seleção
                          </CommandItem>

                          {displayCategoryOptions.map((group) => (
                            <CommandGroup
                              key={`sheet-${group.label}`}
                              heading={group.label}
                            >
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
                                    setCategory(
                                      selectedItem ? selectedItem.id : undefined
                                    );
                                    setCategoryPopoverOpen(false);
                                  }}
                                  className="flex items-center justify-between w-full"
                                >
                                  <span>{item.name}</span>
                                  <Check
                                    className={cn(
                                      "ml-2 h-4 w-4",
                                      category === item.id
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
                <div className="grid gap-2">
                  <Label htmlFor="negotiator">Negociador</Label>
                  <Select value={negotiator} onValueChange={setNegotiator}>
                    <SelectTrigger id="negotiator" className="w-full">
                      <SelectValue placeholder="Selecione um negociador" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockNegotiators.map((neg) => (
                        <SelectItem key={neg} value={neg}>
                          {neg}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="text-sm font-medium leading-none">
                Parcelamento e Pagamento
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2 self-start">
                  <Label htmlFor="installments">Parcelamento</Label>
                  <Select
                    value={installmentOption}
                    onValueChange={setInstallmentOption}
                  >
                    <SelectTrigger id="installments" className="w-full">
                      <SelectValue placeholder="Selecione parcelamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {installmentOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data de Pagamento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={`w-full justify-start text-left font-normal ${
                          !paymentDate && "text-muted-foreground"
                        }`}
                        disabled={isPending}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {paymentDate ? (
                          format(paymentDate, "PPP", { locale: ptBR })
                        ) : (
                          <span></span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={paymentDate}
                        onSelect={setPaymentDate}
                        initialFocus
                        locale={ptBR}
                        disabled={isPending}
                      />
                    </PopoverContent>
                  </Popover>
                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id="isPending"
                      checked={isPending}
                      onCheckedChange={(checked: CheckedState) =>
                        setIsPending(!!checked)
                      }
                    />
                    <Label
                      htmlFor="isPending"
                      className="cursor-pointer text-sm"
                    >
                      Pagamento pendente
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t flex-shrink-0">
            <SheetClose asChild>
              <Button type="submit">Salvar</Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
