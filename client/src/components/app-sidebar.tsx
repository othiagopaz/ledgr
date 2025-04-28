import * as React from "react";
import { Settings2, Banknote } from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

// This is sample data.
const data = {
  user: {
    name: "Thiago Paz",
    email: "paz@ledgr.com.br",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Views",
      url: "#",
      icon: Banknote,
      isActive: true,
      items: [
        {
          title: "P&L",
          url: "/overview",
        },
        {
          title: "Cashflow statement",
          url: "/",
        },
        {
          title: "Invoices",
          url: "/",
        },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
      items: [
        {
          title: "Categories",
          url: "#",
        },
        {
          title: "Credit Cards",
          url: "#",
        },
        {
          title: "Bank Accounts",
          url: "#",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
