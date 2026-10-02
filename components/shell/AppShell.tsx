"use client";

import { cn } from "@/lib/utils";
import CompanyInfoModal from "@/components/CompanyInfoModal";
import { ShellProvider, useShell } from "./ShellContext";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DomainTabs from "./DomainTabs";

function Frame({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const { collapsed, infoOpen, setInfoOpen } = useShell();
  return (
    <div className={cn("shell", collapsed && "shell-collapsed")}>
      <Sidebar username={username} />
      <div className="shell-main">
        <Topbar />
        <DomainTabs />
        <main className="page-body">
          <div className="page-inner">{children}</div>
        </main>
      </div>
      <CompanyInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

export default function AppShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  return (
    <ShellProvider>
      <Frame username={username}>{children}</Frame>
    </ShellProvider>
  );
}
