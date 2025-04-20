import * as React from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils"; // Import cn for conditional classes

// Assuming TransactionType is defined globally or adjust import path
// import { TransactionType } from './path-to-types';
type TransactionType = "INCOME" | "EXPENSE" | "TRANSFERENCE"; // Local definition for now

interface SummaryData {
  totalReceitas: number;
  totalSaidas: number;
  totalPeriodo: number;
}

interface SummaryCardsProps {
  summaryData: SummaryData;
  formatCurrency: (value: number) => string;
  selectedType: TransactionType | undefined;
  setSelectedType: (type: TransactionType | undefined) => void;
}

export function SummaryCards({
  summaryData,
  formatCurrency,
  selectedType,
  setSelectedType,
}: SummaryCardsProps) {
  const handleTypeClick = (type: TransactionType) => {
    // Toggle selection: if clicking the same type, clear filter; otherwise, select it.
    setSelectedType(selectedType === type ? undefined : type);
  };

  const handleTotalClick = () => {
    // Always clear the type filter when clicking "Total do Período"
    setSelectedType(undefined);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Receitas Card */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          "px-4 py-3",
          selectedType === "INCOME" && "ring-2 ring-green-800" // Subtle ring
        )}
        onClick={() => handleTypeClick("INCOME")}
      >
        <div className="flex flex-col gap-y-0">
          <CardDescription className="text-xs">
            Total de Receitas
          </CardDescription>
          <CardTitle className="text-lg text-green-800">
            {formatCurrency(summaryData.totalReceitas)}
          </CardTitle>
        </div>
      </Card>

      {/* Saídas Card */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          "px-4 py-3",
          selectedType === "EXPENSE" && "ring-2 ring-red-800" // Subtle ring
        )}
        onClick={() => handleTypeClick("EXPENSE")}
      >
        <div className="flex flex-col gap-y-0">
          <CardDescription className="text-xs">Total de Saídas</CardDescription>
          <CardTitle className="text-lg text-red-800">
            {formatCurrency(summaryData.totalSaidas)}
          </CardTitle>
        </div>
      </Card>

      {/* Total do Período Card */}
      <Card
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          "px-4 py-3",
          selectedType === undefined && "ring-2 ring-gray-800" // Subtle ring (default)
        )}
        onClick={handleTotalClick} // Clear filter on click
      >
        <div className="flex flex-col gap-y-0">
          <CardDescription className="text-xs">
            Total do Período
          </CardDescription>
          <CardTitle className="text-lg">
            {formatCurrency(summaryData.totalPeriodo)}
          </CardTitle>
        </div>
      </Card>
    </div>
  );
}
