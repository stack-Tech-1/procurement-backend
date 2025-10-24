"use client";
import { useEffect, useState } from "react";
import {
  Home,
  Users,
  FileText,
  ClipboardList,
  FileSignature,
  BarChart3,
  CheckSquare,
  LogOut,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";

export default function Sidebar() {
  const [user, setUser] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // 🧠 Fetch pending user count (Admin only)
  const fetchPendingUsers = async (showToast = false) => {
    if (!user?.roleId || user.roleId !== 1) return; // only admin

    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/pending`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setPendingCount(data.length);
        if (showToast) toast.success("Pending list updated!");
      }
    } catch (err) {
      console.error("Error fetching pending users:", err);
      if (showToast) toast.error("Failed to refresh pending users.");
    } finally {
      setLoading(false);
    }
  };

  // 🔄 Load user and initial pending count
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      setUser(parsed);

      if (parsed.roleId === 1) fetchPendingUsers();
    }
  }, []);

  // 🕒 Auto-refresh every 30 seconds
  useEffect(() => {
    if (user?.roleId === 1) {
      const interval = setInterval(() => fetchPendingUsers(), 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // 📋 Nav Items
  const navItems = [
    { name: "Dashboard", icon: <Home size={18} />, href: "/dashboard" },
    { name: "Vendors", icon: <Users size={18} />, href: "/dashboard/procurement/vendors" },
    { name: "RFQs", icon: <ClipboardList size={18} />, href: "/rfqs" },
    { name: "Contracts", icon: <FileText size={18} />, href: "/contracts" },
    { name: "IPCs", icon: <FileSignature size={18} />, href: "/ipcs" },
    { name: "Cost Control", icon: <BarChart3 size={18} />, href: "/cost-control" },
  ];

  // ✅ Add Approvals only for Admins
  if (user?.roleId === 1) {
    navItems.push({
      name: "Approvals",
      icon: <CheckSquare size={18} />,
      href: "/dashboard/admin/approvals",
    });
  }

  if (user?.roleId === 1) {
    navItems.push({
      name: "User Management",
      icon: <Users size={18} />,
      href: "/dashboard/admin/users",
    });
  }

  return (
    <aside className="bg-slate-900 text-gray-100 w-64 min-h-screen flex flex-col justify-between">
      {/* --- Brand Header --- */}
      <div>
        <div className="p-6 text-2xl font-semibold border-b border-slate-700">
          <span className="text-indigo-400">Procure</span>Track
        </div>

        {/* --- Navigation --- */}
        <nav className="mt-6 space-y-1">
          {navItems.map((item) => (
            <div key={item.name} className="relative">
              <Link
                href={item.href}
                className="flex items-center justify-between px-6 py-3 text-sm hover:bg-slate-800 hover:text-indigo-400 transition"
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.name}</span>
                </div>

                {/* 🧩 Approvals badge & refresh button */}
                {item.name === "Approvals" && (
                  <div className="flex items-center gap-2">
                    {loading ? (
                      <RefreshCw size={14} className="animate-spin text-gray-400" />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          fetchPendingUsers(true);
                        }}
                        title="Refresh"
                        className="text-gray-400 hover:text-indigo-400 transition"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}

                    {pendingCount > 0 && (
                      <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            </div>
          ))}
        </nav>
      </div>

      {/* --- Logout --- */}
      <div className="px-6 py-4 border-t border-slate-700">
        <button
          onClick={() => {
            localStorage.clear();
            window.location.href = "/login";
          }}
          className="flex items-center gap-3 text-sm text-gray-400 hover:text-red-400 transition"
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
    </aside>
  );
}
