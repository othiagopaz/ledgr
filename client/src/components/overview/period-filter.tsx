import * as React from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";

interface PeriodFilterProps {
  years: number[];
  months: string[];
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedMonthIndex: number | null;
  setSelectedMonthIndex: (index: number | null) => void;
  lastSelectedMonthIndex: number | null;
  setLastSelectedMonthIndex: (index: number | null) => void;
}

export function PeriodFilter({
  years,
  months,
  selectedYear,
  setSelectedYear,
  selectedMonthIndex,
  setSelectedMonthIndex,
  lastSelectedMonthIndex,
  setLastSelectedMonthIndex,
}: PeriodFilterProps) {
  return (
    <div className="flex w-full flex-col sm:flex-row items-center gap-4">
      {/* Month Carousel Section (Left) */}
      <div className="flex w-full sm:flex-1 items-center gap-2">
        <Carousel
          opts={{
            align: "start",
            startIndex: selectedMonthIndex ?? 0,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-2">
            <CarouselItem key="all-months" className="basis-auto pl-2">
              <Button
                variant={selectedMonthIndex === null ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (selectedMonthIndex === null) {
                    setSelectedMonthIndex(lastSelectedMonthIndex);
                  } else {
                    setLastSelectedMonthIndex(selectedMonthIndex);
                    setSelectedMonthIndex(null);
                  }
                }}
                className="min-w-[50px] max-w-[70px] w-full h-7 px-2 text-xs"
              >
                Todos
              </Button>
            </CarouselItem>
            {months.map((month, index) => (
              <CarouselItem key={month} className="basis-auto pl-2">
                <Button
                  variant={
                    selectedMonthIndex === null || selectedMonthIndex === index
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setLastSelectedMonthIndex(index);
                    setSelectedMonthIndex(index);
                  }}
                  className="min-w-[50px] max-w-[70px] w-full h-7 px-2 text-xs"
                >
                  {month}
                </Button>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
      {/* Year Carousel Section (Right) */}
      <div className="w-full sm:w-auto">
        <Carousel
          opts={{
            align: "start",
          }}
          className="w-full max-w-[180px]"
        >
          <CarouselContent className="-ml-2">
            {years.map((year) => (
              <CarouselItem key={year} className="basis-auto pl-2">
                <Button
                  variant={selectedYear === year ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedYear(year)}
                  className="min-w-[50px] max-w-[70px] w-full h-7 px-2 text-xs"
                >
                  {year}
                </Button>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  );
}
