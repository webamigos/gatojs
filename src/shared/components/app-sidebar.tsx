"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  ChevronUp,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Settings,
} from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { project } from "@/shared/config/project";
import { authClient } from "@/shared/lib/auth/client";
import type { AccessContext } from "@/shared/lib/auth/permissions";
import { getBranding } from "@/shared/lib/modules/branding";
import { getNavEntries, isActiveEntry } from "@/shared/lib/modules/nav";
import { BrandLogo } from "@/shared/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/lib/utils";

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

function BrandHeading() {
  const { logo } = getBranding();
  return logo === undefined ? project.name : <BrandLogo logo={logo} />;
}

export function MobileHeader() {
  const { setMobileOpen } = useSidebar();
  const t = useTranslations("sidebar");
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMobileOpen(true)}
        aria-label={t("open-menu")}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-lg font-bold">
        <BrandHeading />
      </h1>
    </header>
  );
}

interface AppSidebarProps {
  accessContext: AccessContext;
  userName: string;
  userEmail: string;
}

function userInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AppSidebar({
  accessContext,
  userName,
  userEmail,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const t = useTranslations();
  const { userRole, orgRole, multiOrg } = accessContext;
  const entries = useMemo(
    () => getNavEntries({ userRole, orgRole, multiOrg }),
    [userRole, orgRole, multiOrg],
  );

  const displayName = userName || t("sidebar.user-fallback");

  async function handleLogout() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  function handleNavClick() {
    if (mobileOpen) {
      setMobileOpen(false);
    }
  }

  let toggleAriaLabel = t("sidebar.collapse");
  if (mobileOpen) {
    toggleAriaLabel = t("sidebar.close-menu");
  } else if (collapsed) {
    toggleAriaLabel = t("sidebar.expand");
  }

  const sidebarContent = (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col overflow-y-auto p-4 transition-all duration-200",
        "border-r border-sidebar-border text-sidebar-foreground [background:var(--sidebar-gradient)]",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "mb-6 flex items-start",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <h1 className="text-[19px] leading-tight font-bold tracking-tight text-sidebar-primary-foreground">
            <BrandHeading />
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() =>
            mobileOpen ? setMobileOpen(false) : setCollapsed(!collapsed)
          }
          aria-label={toggleAriaLabel}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-1">
        {entries.map((entry) => {
          const label = t(entry.labelPath);
          const isActive = isActiveEntry(pathname, entry.href, entries);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              title={collapsed ? label : undefined}
              onClick={handleNavClick}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                  : "font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <DynamicIcon
                name={entry.icon as IconName}
                className="h-4 w-4 shrink-0"
                fallback={() => <span className="h-4 w-4 shrink-0" />}
              />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <Popover>
        <PopoverTrigger
          className={cn(
            "flex w-full items-center rounded-lg text-sm transition-colors",
            "border border-sidebar-border bg-white/5 hover:bg-sidebar-accent",
            collapsed ? "justify-center px-1.5 py-1.5" : "gap-3 px-2.5 py-2",
          )}
          title={collapsed ? displayName : undefined}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
            {userInitials(displayName)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-sidebar-primary-foreground">
                  {displayName}
                </span>
              </span>
              <ChevronUp className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />
            </>
          )}
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-56 p-1">
          {userEmail && (
            <div className="truncate px-3 py-2 text-xs text-muted-foreground">
              {userEmail}
            </div>
          )}
          <div className="my-1 h-px bg-border" />
          <Link
            href="/account"
            onClick={handleNavClick}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            {t("sidebar.account")}
          </Link>
          <div className="my-1 h-px bg-border" />
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {t("sidebar.logout")}
          </button>
        </PopoverContent>
      </Popover>
    </aside>
  );

  return (
    <>
      <div className="hidden md:block">{sidebarContent}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="relative h-full w-64 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
