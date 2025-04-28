import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "./components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import { SidebarInset } from "./components/ui/sidebar";

import OverviewPage from "./app/overview/page";

function App() {
  return (
    <Router>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "250px",
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset className="max-w-full">
          <Routes>
            <Route path="/overview" element={<OverviewPage />} />
            {/* <Route path="/transactions" element={<TransactionsPage />} /> */}
            {/* <Route path="/settings" element={<SettingsPage />} /> */}
          </Routes>
        </SidebarInset>
      </SidebarProvider>
    </Router>
  );
}

export default App;
