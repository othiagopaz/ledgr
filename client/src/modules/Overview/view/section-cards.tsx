import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionCard } from "../viewmodel/useOverview";

type SectionCardsProps = {
  sectionCards: SectionCard[];
};

export function SectionCards({ sectionCards }: SectionCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-4 px-4 lg:px-6 *:data-[slot=card]:bg-gradient-to-br *:data-[slot=card]:from-background *:data-[slot=card]:to-muted/20 *:data-[slot=card]:shadow-sm dark:*:data-[slot=card]:from-background dark:*:data-[slot=card]:to-muted/10">
      {sectionCards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">
              {card.percentage} from last month
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
