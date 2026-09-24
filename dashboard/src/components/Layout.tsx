import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { LayoutDashboard, Users, Upload, MessageSquare, ShieldCheck, Activity } from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/subcontractors", label: "Subcontractors", icon: Users, end: false },
  { to: "/upload", label: "Upload", icon: Upload, end: false },
  { to: "/assistant", label: "Assistant", icon: MessageSquare, end: false },
  { to: "/activity", label: "Activity", icon: Activity, end: false },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Compliance Dashboard", sub: "Live subcontractor compliance posture" },
  "/subcontractors": { title: "Subcontractors", sub: "Every tracked sub and their document status" },
  "/upload": { title: "Upload Documents", sub: "COI, licence, W-9, bond and CSV imports" },
  "/assistant": { title: "Compliance Assistant", sub: "Ask about statuses or paste document text" },
  "/activity": { title: "Activity", sub: "Everything that changed in this workspace" },
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const meta = TITLES[location.pathname] ?? {
    title: "SubLedger",
    sub: "Subcontractor compliance",
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SL</div>
          <div>
            <div className="brand-name">SubLedger</div>
            <div className="brand-sub">Construction Subcontractor</div>
          </div>
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            <item.icon size={16} />
            {item.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Compliance before claims
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">{meta.title}</h1>
            <div className="page-sub">{meta.sub}</div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
