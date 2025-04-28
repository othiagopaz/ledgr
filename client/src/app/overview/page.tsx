import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SectionCards } from "@/modules/Overview/view/section-cards";
import { DataTable } from "@/modules/Overview/view/data-table";
import {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbItem,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { useOverview } from "@/modules/Overview/viewmodel/useOverview";
import { useEvent } from "@/modules/Events/viewmodel/useEvent";
import { Loader2 } from "lucide-react";
export default function OverviewPage() {
  const { sectionCards } = useOverview();
  const { transactions, isLoading } = useEvent();

  return (
    <SidebarInset>
      <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="#">Views</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Overview</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <SectionCards sectionCards={sectionCards} />
        <div className="px-4 lg:px-6"></div>
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <DataTable data={transactions} />
        )}
      </div>
    </SidebarInset>
  );
}
