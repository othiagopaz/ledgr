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
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckedState } from "@radix-ui/react-checkbox";

type FormTransactionType = "INCOME" | "EXPENSE";

interface CreateTransactionSheetProps {
  children: React.ReactNode; // Trigger button
  initialType: FormTransactionType; // Type determined by trigger button
}

// Mock data (replace with API data later)
const mockCategories = ["Salário", "Alimentação", "Transporte", "Lazer"];
const mockNegotiators = ["Empresa X", "Mercado Y", "Restaurante Z", "Outro"];
const mockAccounts = ["Conta Corrente A", "Cartão B", "Poupança C"];
const installmentOptions = [
  ...Array.from({ length: 12 }, (_, i) => `${i + 1}x`),
];

export function CreateTransactionSheet({
  children,
  initialType,
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
                  <Label htmlFor="account">Conta/Cartão</Label>
                  <Select value={account} onValueChange={setAccount}>
                    <SelectTrigger id="account" className="w-full">
                      <SelectValue placeholder="Selecione conta ou cartão" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockAccounts.map((acc) => (
                        <SelectItem key={acc} value={acc}>
                          {acc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label htmlFor="category">Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
