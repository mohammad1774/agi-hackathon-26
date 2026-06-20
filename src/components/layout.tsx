import { useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  Radar,
  Stethoscope,
  UserCircle2,
  ClipboardList,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { Role } from "@/types";
import { useReferralStore } from "@/store/useReferralStore";
import { cn } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Impact", icon: LayoutDashboard, roles: ["physician", "admin"] },
  { to: "/workbench", label: "Workbench", icon: Stethoscope, roles: ["physician"] },
  { to: "/tracker", label: "Referral Tracker", icon: Radar, roles: ["physician", "admin"] },
  { to: "/admin", label: "Admin Queue", icon: ClipboardList, roles: ["admin"] },
  { to: "/patient", label: "My Referrals", icon: UserCircle2, roles: ["patient"] },
];

export function Sidebar() {
  const role = useReferralStore((s) => s.role);
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sand-200/70 bg-white/60 px-4 py-6 backdrop-blur-sm lg:flex">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 shadow-soft">
          <Activity className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-extrabold leading-tight text-sand-900">Referral GPS</div>
          <div className="text-[11px] font-medium text-sand-400">Right care, first time</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100"
                  : "text-sand-500 hover:bg-sand-100 hover:text-sand-700"
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <StreamingToggle />
    </aside>
  );
}

export function MobileNav() {
  const role = useReferralStore((s) => s.role);
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200/80 bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-soft backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100"
                  : "text-sand-500 hover:bg-sand-100 hover:text-sand-700"
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function StreamingToggle() {
  const streaming = useReferralStore((s) => s.streaming);
  const toggle = useReferralStore((s) => s.toggleStreaming);
  return (
    <button
      onClick={toggle}
      className="mt-4 flex items-center gap-2.5 rounded-xl bg-sand-100 px-3 py-2.5 text-xs font-semibold text-sand-600 transition-colors hover:bg-sand-200"
      title="Toggle simulated AI streaming animation"
    >
      {streaming ? (
        <Wifi className="h-4 w-4 text-lavender-500" />
      ) : (
        <WifiOff className="h-4 w-4 text-sand-400" />
      )}
      AI streaming: {streaming ? "on" : "off"}
    </button>
  );
}

const ROLE_LABEL: Record<Role, string> = {
  physician: "Family Physician",
  admin: "Clinic Admin",
  patient: "Patient",
};

const ROLE_SHORT_LABEL: Record<Role, string> = {
  physician: "Physician",
  admin: "Admin",
  patient: "Patient",
};

const ROLE_HOME: Record<Role, string> = {
  physician: "/workbench",
  admin: "/admin",
  patient: "/patient",
};

const ROLES: Role[] = ["physician", "admin", "patient"];

export function TopBar() {
  const role = useReferralStore((s) => s.role);
  const setRole = useReferralStore((s) => s.setRole);
  const location = useLocation();
  const navigate = useNavigate();

  const title = pageTitle(location.pathname);
  const routeRole = roleForExclusivePath(location.pathname);

  useEffect(() => {
    if (routeRole && role !== routeRole) {
      setRole(routeRole);
    }
  }, [role, routeRole, setRole]);

  const changeRole = (nextRole: Role) => {
    setRole(nextRole);
    navigate(ROLE_HOME[nextRole], { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-sand-200/70 bg-white/80 px-3 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-7 sm:py-3.5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-sand-900 sm:text-lg">{title.title}</h1>
          <p className="hidden text-xs text-sand-400 sm:block">{title.subtitle}</p>
        </div>
        <RoleBadge role={role} className="sm:hidden" />
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="scroll-soft flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full bg-sand-100 p-1 sm:flex-none">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => changeRole(r)}
              aria-pressed={role === r}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3",
                role === r
                  ? "bg-white text-lavender-700 shadow-soft"
                  : "text-sand-500 hover:text-sand-700"
              )}
            >
              <span className="sm:hidden">{ROLE_SHORT_LABEL[r]}</span>
              <span className="hidden sm:inline">{ROLE_LABEL[r]}</span>
            </button>
          ))}
        </div>
        <RoleBadge role={role} className="hidden sm:flex" />
      </div>
    </header>
  );
}

function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full bg-lavender-50 py-1 pl-1 pr-3 ring-1 ring-lavender-100",
        className
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-lavender-500 text-xs font-bold text-white">
        {role === "physician" ? "Dr" : role === "admin" ? "AD" : "P"}
      </div>
      <span className="text-xs font-semibold text-lavender-700">{ROLE_SHORT_LABEL[role]}</span>
    </div>
  );
}

function pageTitle(path: string): { title: string; subtitle: string } {
  if (path.startsWith("/dashboard"))
    return { title: "Impact Dashboard", subtitle: "Why the referral pathway is the bottleneck" };
  if (path.startsWith("/workbench"))
    return { title: "Referral Workbench", subtitle: "Evaluate and route referrals before they enter the queue" };
  if (path.startsWith("/tracker"))
    return { title: "Referral Tracker", subtitle: "Closed-loop status across every sent referral" };
  if (path.startsWith("/admin"))
    return { title: "Admin Queue", subtitle: "Resolve gaps and keep referrals moving" };
  if (path.startsWith("/patient"))
    return { title: "My Referrals", subtitle: "Appointment status, prep, and next steps" };
  return { title: "Referral GPS", subtitle: "" };
}

function roleForExclusivePath(path: string): Role | null {
  if (path.startsWith("/workbench")) return "physician";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/patient")) return "patient";
  return null;
}
