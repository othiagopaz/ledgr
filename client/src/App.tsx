import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button"; // Example import for trigger
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"; // Assuming these are in ui based on examples
import { Menu } from "lucide-react"; // Icon for trigger
import { Routes, Route, useLocation } from "react-router-dom"; // Import routing components and useLocation
import { OverviewDashboard } from "@/components/overview-dashboard"; // Import the new dashboard
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"; // Import Breadcrumb components

function App() {
  const location = useLocation(); // Get current location

  // Function to map pathname to breadcrumb title
  const getPageTitle = (pathname: string): string => {
    switch (pathname) {
      case "/overview":
        return "Visão Geral"; // Or "Visão Geral"
      // Add other cases for future routes here
      // case "/configuracoes/contas":
      //   return "Contas";
      default:
        return "Página"; // Default title
    }
  };

  const currentPageTitle = getPageTitle(location.pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Example Header with Trigger */}
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
          <SidebarTrigger className="lg:hidden">
            {/* Show trigger only on smaller screens based on sidebar-08 likely behavior */}
            <Button size="icon" variant="outline">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle Menu</span>
            </Button>
          </SidebarTrigger>
          <div className="w-full flex-1">
            {/* Replaced H1 with Breadcrumb inside the div */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Home</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Lançamentos</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {/* Use dynamic page title */}
                  <BreadcrumbPage className="font-semibold">
                    {currentPageTitle}
                  </BreadcrumbPage>
                </BreadcrumbItem>
                {/* Add more items/separators later if needed */}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          {/* Add User Button / Other Header elements here */}
        </header>

        {/* Main Content Area - Now controlled by routing */}
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
          <Routes>
            <Route path="/overview" element={<OverviewDashboard />} />
            {/* Add other routes here later, e.g.: */}
            {/* <Route path="/configuracoes/contas" element={<AccountsSettings />} /> */}
            <Route path="*" element={<div>Página não encontrada</div>} />{" "}
            {/* Basic 404 */}
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
