import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SectionCards } from "@/components/section-cards";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import data from "./data.json";
import {
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbItem,
  BreadcrumbList,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

export default function OverviewPage() {
  return (
    // <SidebarInset>
    //   <div className="flex flex-1 flex-col">
    //     <div className="@container/main flex flex-1 flex-col gap-0">
    //       <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
    //         <SectionCards />
    //         <div className="px-4 lg:px-6">
    //           <ChartAreaInteractive />
    //         </div>
    //         <DataTable data={data} />
    //       </div>
    //     </div>
    //   </div>
    // </SidebarInset>

    <SidebarInset>
      <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="#">All Inboxes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Inbox</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {Array.from({ length: 24 }).map((_, index) => (
          <div
            key={index}
            className="aspect-video h-12 w-full rounded-lg bg-muted/50"
          />
        ))}
      </div>
    </SidebarInset>
  );
}
