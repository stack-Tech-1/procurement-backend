"use client";
import { Bell, UserCircle2 } from "lucide-react";

export default function Topbar({ user }) {
  return (
    <header className="flex justify-between items-center px-8 py-4 bg-white shadow-sm border-b border-gray-100">
      <h1 className="text-xl font-semibold text-slate-700">Dashboard</h1>
      <div className="flex items-center gap-6">
        <button className="relative text-gray-600 hover:text-indigo-500">
          <Bell size={22} />
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <UserCircle2 size={26} className="text-indigo-600" />
          <div>
            <p className="font-medium">{user?.name || "User"}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
