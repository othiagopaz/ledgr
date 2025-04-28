import { useEffect } from "react";
import { useState } from "react";
import { formatCurrency, formatPercentage } from "@/lib/utils";

export type SectionCard = {
  title: string;
  value: string;
  percentage: string;
};

export function useOverview() {
  const [sectionCards, setSectionCards] = useState<SectionCard[]>([]);

  useEffect(() => {
    setSectionCards([
      {
        title: "Total Incomes",
        value: formatCurrency(120),
        percentage: formatPercentage(0.1),
      },
      {
        title: "Total Expenses",
        value: formatCurrency(-4000),
        percentage: formatPercentage(0.13),
      },
      {
        title: "Total Balance",
        value: formatCurrency(1000),
        percentage: formatPercentage(0.1),
      },
    ]);
  }, []);

  return { sectionCards };
}
