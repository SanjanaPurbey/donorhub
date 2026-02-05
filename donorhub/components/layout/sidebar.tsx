"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Droplet,
  LayoutDashboard,
  Users,
  Heart,
  GitMerge,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "Donors",
    href: "/dashboard/donors",
    icon: <Heart className="h-5 w-5" />,
  },
  {
    label: "Blood Requests",
    href: "/dashboard/requests",
    icon: <Droplet className="h-5 w-5" />,
  },
  {
    label: "Match Results",
    href: "/dashboard/matches",
    icon: <GitMerge className="h-5 w-5" />,
  },
  {
    label: "Users",
    href: "/dashboard/users",
    icon: <Users className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    label: "Hash Ledger",
    href: "/dashboard/ledger",
    icon: <Shield className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    label: "Dev Tools",
    href: "/dashboard/settings/dev-tools",
    icon: <Wrench className="h-5 w-5" />,
    adminOnly: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isAdmin = session?.user?.role === "SYSTEM_ADMIN";
  const filteredNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600">
            <Droplet className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-slate-900">DonorHub</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full w-64 transform border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600">
              <Droplet className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-slate-900">DonorHub</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {filteredNavItems.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-rose-50 text-rose-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      <span className={cn(isActive ? "text-rose-600" : "text-slate-400")}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User Menu */}
          <div className="border-t border-slate-200 p-4">
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-100 cursor-pointer"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-700 font-medium text-sm">
                  {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {session?.user?.name || "User"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {session?.user?.role === "SYSTEM_ADMIN" ? "System Admin" : "Coordinator"}
                  </p>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-slate-400 transition-transform",
                  isUserMenuOpen && "rotate-180"
                )} />
              </button>

              {isUserMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
