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
import {
  getAccounts,
  getCreditCards,
  FinancialInstrument,
  getCategories,
  Category,
} from "@/services/api";
// Import the new mapper functions
import {
  mapAccountToFinancialInstrument,
  mapCreditCardToFinancialInstrument,
} from "@/utils/mappers";

// --- Helper Functions for Formatting (Move to utils later) ---
// function formatAccountType(type: string): string {...}
// function formatCardFlag(flag: string): string {...}

// --- Define a unified type for the dropdown ---
// Remove the commented out definition below, as it's now imported from api.ts
// // Move this definition to api.ts or a shared types file if FinancialInstrument is not exported from api.ts
// // export interface FinancialInstrument {
// //   id: string;
// //   name: string;
// //   kind: 'ACCOUNT' | 'CREDIT_CARD'; // Differentiator
// // }

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
  // selectedAccount now holds an array of FinancialInstrument IDs
  const [selectedAccount, setSelectedAccount] = React.useState<string[]>([]);
  const [selectedType, setSelectedType] = React.useState<
    TransactionType | undefined
  >();
  // selectedCategory now holds an array of category IDs
  const [selectedCategory, setSelectedCategory] = React.useState<string[]>([]);

  // State for unified Financial Instruments
  const [financialInstruments, setFinancialInstruments] = React.useState<
    FinancialInstrument[]
  >([]);
  const [isLoadingInstruments, setIsLoadingInstruments] = React.useState(true);
  const [instrumentsError, setInstrumentsError] = React.useState<string | null>(
    null
  );

  // State holds raw categories now
  const [rawCategories, setRawCategories] = React.useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(true);
  const [categoriesError, setCategoriesError] = React.useState<string | null>(
    null
  );

  // Fetch and map data using imported mappers
  React.useEffect(() => {
    async function fetchAllData() {
      setIsLoadingInstruments(true);
      setIsLoadingCategories(true);
      setInstrumentsError(null);
      setCategoriesError(null);

      try {
        const [accountsData, creditCardsData, categoriesData] =
          await Promise.all([getAccounts(), getCreditCards(), getCategories()]);

        // Use mapper functions
        const mappedAccounts = accountsData.map(
          mapAccountToFinancialInstrument
        );
        const mappedCreditCards = creditCardsData.map(
          mapCreditCardToFinancialInstrument
        );

        setFinancialInstruments([...mappedAccounts, ...mappedCreditCards]);

        // Store raw categories
        setRawCategories(categoriesData);
      } catch (error) {
        console.error("Erro ao buscar dados iniciais:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Falha ao carregar dados.";
        setInstrumentsError(errorMessage);
        setCategoriesError(errorMessage);
      } finally {
        setIsLoadingInstruments(false);
        setIsLoadingCategories(false);
      }
    }

    fetchAllData();
  }, []);

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
        financialInstruments={financialInstruments}
        isLoadingInstruments={isLoadingInstruments}
        instrumentsError={instrumentsError}
        rawCategories={rawCategories}
        isLoadingCategories={isLoadingCategories}
        categoriesError={categoriesError}
        selectedType={selectedType}
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
