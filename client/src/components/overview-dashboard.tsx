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
import { Badge } from "@/components/ui/badge";
import { TransactionFilters } from "@/components/transaction-filters";
import { Event, TransactionPayload, TransactionStatus } from "@/services/Event";
import { useFetchEvents } from "@/hooks/useFetchEvents";
import { useFetchFinancialInstruments } from "@/hooks/useFetchFinancialInstruments";
import { useFetchCategories } from "@/hooks/useFetchCategories";
import { SummaryCards } from "./summary-cards";
import { PeriodFilter } from "./period-filter";
import { Button } from "./ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Category } from "@/services/Category";
import { FinancialInstrument } from "@/services/api";

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

export function OverviewDashboard() {
  // State for filters
  const [selectedMonthIndex, setSelectedMonthIndex] = React.useState<number>(
    new Date().getMonth()
  );
  const [selectedYear, setSelectedYear] = React.useState<number>(
    new Date().getFullYear()
  );
  const selectedType = undefined; // Use undefined directly if state setter removed
  const selectedCategoryId = undefined; // Use undefined directly if state setter removed
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [lastSelectedMonthIndex, setLastSelectedMonthIndex] = React.useState<
    number | null
  >(null);
  const [selectedAccount, setSelectedAccount] = React.useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<string[]>([]);

  // State for data fetching (Instruments and Categories)
  const {
    data: financialInstruments,
    isLoading: isLoadingInstruments,
    error: instrumentsError,
  } = useFetchFinancialInstruments();
  const {
    data: categories,
    isLoading: isLoadingCategories,
    error: categoriesError,
  } = useFetchCategories();

  // Log fetched categories
  React.useEffect(() => {
    console.log("Fetched Categories:", categories);
  }, [categories]);

  // State for pagination
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const ITEMS_PER_PAGE = 50; // Define items per page

  // Fetch Events using the hook
  const {
    events,
    isLoading: isLoadingEvents,
    error: eventsError,
    totalPages,
  } = useFetchEvents({
    selectedYear,
    selectedMonthIndex,
    currentPage,
    limit: ITEMS_PER_PAGE,
    // Pass other filters here later
  });

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedYear, selectedMonthIndex, searchTerm, selectedCategoryId]);

  // Re-added helper function to get category name by ID
  const getCategoryName = (categoryId: string): string => {
    const category = categories?.find((cat: Category) => cat.id === categoryId);
    return category?.name || categoryId; // Fallback to ID if not found
  };

  // Re-added helper function to get financial instrument name by ID
  const getFinancialInstrumentName = (
    accountId?: string,
    creditCardId?: string
  ): string => {
    const instrument = financialInstruments?.find(
      (inst: FinancialInstrument) =>
        inst.id === accountId || inst.id === creditCardId
    );
    // Fallback to ID if not found
    return instrument?.name || accountId || creditCardId || "N/A";
  };

  // Flatten Events into Transactions for display
  const flattenedTransactions = React.useMemo(() => {
    console.log("Calculating flattenedTransactions. Categories:", categories);
    console.log("Calculating flattenedTransactions. Events:", events);
    return events.flatMap((event: Event) =>
      event.transactions.map((transaction: TransactionPayload) => {
        const categoryId = event.category.id;
        const categoryName = getCategoryName(categoryId);
        console.log(
          `Event ID: ${event.id}, Category ID: ${categoryId}, Found Name: ${categoryName}`
        ); // Log mapping

        return {
          id: transaction.id, // Use transaction ID for the row key
          date: transaction.competenceDate, // Use transaction competence date
          type: transaction.type, // From transaction
          description: event.description, // From event
          negotiator: event.negotiatorId ?? "N/A", // Use negotiatorId directly
          category: categoryName, // Use the already looked-up name
          accountOrCard: getFinancialInstrumentName(
            transaction.accountId,
            transaction.creditCardId
          ), // Map account/card ID to name
          value: transaction.amount, // From transaction (in cents)
          status: transaction.status, // From transaction
        };
      })
    );
  }, [events, categories, financialInstruments]); // Dependencies

  // Wrapper for setSelectedMonthIndex to match PeriodFilter prop type
  const handleMonthChange = (index: number | null) => {
    if (index !== null) {
      setSelectedMonthIndex(index);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Section Cards - Replaced with component */}
      <SummaryCards
        summaryData={summaryData}
        selectedType={selectedType}
        formatCurrency={() => ""}
        setSelectedType={() => {}}
      />

      {/* Year and Month Carousel Section - Replaced with component */}
      <PeriodFilter
        years={[selectedYear - 2, selectedYear - 1, selectedYear]}
        months={months}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedMonthIndex={selectedMonthIndex}
        setSelectedMonthIndex={handleMonthChange}
        lastSelectedMonthIndex={lastSelectedMonthIndex}
        setLastSelectedMonthIndex={setLastSelectedMonthIndex}
      />

      {/* Filters Row - Replaced with component */}
      <TransactionFilters
        financialInstruments={financialInstruments || []}
        rawCategories={categories || []}
        selectedType={selectedType}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isLoadingInstruments={isLoadingInstruments}
        instrumentsError={instrumentsError}
        isLoadingCategories={isLoadingCategories}
        categoriesError={categoriesError}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
      />

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Loading and Error States */}
          {isLoadingEvents && (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-[80%]" />
              <Skeleton className="h-8 w-[90%]" />
            </div>
          )}
          {eventsError && (
            <p className="p-4 text-center text-red-600">
              Erro ao carregar transações: {eventsError}
            </p>
          )}

          {!isLoadingEvents && !eventsError && (
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
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flattenedTransactions.length > 0 ? (
                  flattenedTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="hidden sm:table-cell">
                        {tx.date}
                      </TableCell>
                      <TableCell>{tx.type}</TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {tx.negotiator}
                      </TableCell>
                      <TableCell>{tx.category}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {tx.accountOrCard}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.value / 100}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge
                          variant={
                            tx.status === TransactionStatus.PAID
                              ? "default"
                              : tx.status === TransactionStatus.PENDING
                              ? "secondary"
                              : "secondary"
                          }
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      Nenhuma transação encontrada para o período/filtros
                      selecionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {/* Pagination Controls */}
          {!isLoadingEvents && !eventsError && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <span>
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
