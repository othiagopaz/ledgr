import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// Removed Carousel, Input, Select, Button, Search imports as they are now in sub-components

// Import the new components
import { SummaryCards } from "./summary-cards";
import { PeriodFilter } from "./period-filter";
import { TransactionFilters } from "./transaction-filters";

// --- Placeholder Data ---
const summaryData = {
  totalReceitas: 12530.5,
  totalSaidas: 7840.2,
  totalPeriodo: 4690.3,
};

const months = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

// Placeholder transaction type
type TransactionType = "INCOME" | "EXPENSE" | "TRANSFERENCE";

// Placeholder transaction data structure
interface Transaction {
  id: string;
  date: string; // Format: YYYY-MM-DD or similar
  type: TransactionType;
  description: string;
  negotiator: string | null; // e.g., person or company
  category: string;
  accountOrCard: string; // Name of the bank account or credit card
  value: number;
}

// Example transactions
const transactions: Transaction[] = [
  {
    id: "1",
    date: "2024-07-15",
    type: "INCOME",
    description: "Salário",
    negotiator: "Empresa X",
    category: "Salário",
    accountOrCard: "Conta Corrente A",
    value: 5000,
  },
  {
    id: "2",
    date: "2024-07-16",
    type: "EXPENSE",
    description: "Supermercado",
    negotiator: "Mercado Y",
    category: "Alimentação",
    accountOrCard: "Cartão de Crédito B",
    value: -350.75,
  },
  {
    id: "3",
    date: "2024-07-18",
    type: "EXPENSE",
    description: "Restaurante",
    negotiator: "Restaurante Z",
    category: "Lazer",
    accountOrCard: "Cartão de Crédito B",
    value: -85.5,
  },
  {
    id: "4",
    date: "2024-07-20",
    type: "TRANSFERENCE",
    description: "Transferência para Poupança",
    negotiator: null,
    category: "Transferência",
    accountOrCard: "Conta Corrente A -> Poupança C",
    value: -1000.0,
  },
  // ... add more transactions as needed
];

// Example filter options (replace with dynamic data later)
const accountOptions = [
  "Conta Corrente A",
  "Cartão de Crédito B",
  "Poupança C",
];
// const typeOptions: TransactionType[] = ["INCOME", "EXPENSE", "TRANSFERENCE"]; // Removed unused variable
const categoryOptions = ["Salário", "Alimentação", "Lazer", "Transferência"];

// --- Component ---
export function OverviewDashboard() {
  // State for filters (example)
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];
  const [selectedYear, setSelectedYear] = React.useState<number>(currentYear);
  const currentMonth = new Date().getMonth();
  const [selectedMonthIndex, setSelectedMonthIndex] = React.useState<
    number | null
  >(currentMonth);
  const [lastSelectedMonthIndex, setLastSelectedMonthIndex] = React.useState<
    number | null
  >(currentMonth);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedAccount, setSelectedAccount] = React.useState<
    string | undefined
  >();
  const [selectedType, setSelectedType] = React.useState<
    TransactionType | undefined
  >();
  const [selectedCategory, setSelectedCategory] = React.useState<
    string | undefined
  >();

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatDate = (dateString: string) => {
    // Basic date formatting, consider using a library like date-fns for robustness
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Section Cards - Replaced with component */}
      <SummaryCards
        summaryData={summaryData}
        formatCurrency={formatCurrency}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
      />

      {/* Year and Month Carousel Section - Replaced with component */}
      <PeriodFilter
        years={years}
        months={months}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedMonthIndex={selectedMonthIndex}
        setSelectedMonthIndex={setSelectedMonthIndex}
        lastSelectedMonthIndex={lastSelectedMonthIndex}
        setLastSelectedMonthIndex={setLastSelectedMonthIndex}
      />

      {/* Filters Row - Replaced with component */}
      <TransactionFilters
        accountOptions={accountOptions}
        categoryOptions={categoryOptions}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />

      {/* Data Table Section - Remains here */}
      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-[100px] sm:table-cell">
                  Data
                </TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="hidden md:table-cell">
                  Negociador
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  Categoria
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Conta/Cartão
                </TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions
                // Add filtering logic here based on searchTerm, selectedMonthIndex, dropdown filters etc.
                .map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="hidden sm:table-cell">
                      {formatDate(transaction.date)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          transaction.type === "INCOME"
                            ? "bg-green-100 text-green-900"
                            : transaction.type === "EXPENSE"
                            ? "bg-red-100 text-red-900"
                            : "bg-blue-100 text-blue-900" // TRANSFERENCE
                        }`}
                      >
                        {transaction.type}
                      </span>
                    </TableCell>
                    <TableCell>{transaction.description}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {transaction.negotiator ?? "-"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {transaction.category}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {transaction.accountOrCard}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        transaction.value > 0
                          ? "text-green-800"
                          : "text-red-800"
                      }`}
                    >
                      {formatCurrency(transaction.value)}
                    </TableCell>
                  </TableRow>
                ))}
              {/* Add a row for loading state or if no transactions match filters */}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Nenhuma transação encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {/* Optional: Add CardFooter for pagination if needed */}
      </Card>
    </div>
  );
}
