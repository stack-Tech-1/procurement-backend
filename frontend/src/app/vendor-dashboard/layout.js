"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Home, Send, ListOrdered, X, Briefcase, LogOut } from 'lucide-react';

export default function VendorLayout({ children }) {
  const [open, setOpen] = useState(true); // always visible on desktop

  const navItems = [
    { name: 'Dashboard', href: '/vendor-dashboard', icon: <Home size={18} /> },
    { name: 'Submit Proposal', href: '/vendor-dashboard/proposal', icon: <Send size={18} /> },
    { name: 'Track Submissions', href: '/vendor-dashboard/tracker', icon: <ListOrdered size={18} /> },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-gray-100 shadow-2xl">
        <div className="p-6 text-2xl font-semibold border-b border-slate-700">
          <span className="text-teal-400">Vendor</span>Portal
        </div>

        <nav className="mt-6 flex-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="block flex items-center gap-3 px-6 py-3 text-sm hover:bg-slate-800 hover:text-teal-400 transition">              
                {item.icon}
                <span>{item.name}</span>              
            </Link>
          ))}
        </nav>

        
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
 


      {/* Mobile topbar + collapsible drawer */}
      <div className="md:hidden w-full bg-white border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Briefcase className="text-teal-600" />
            <div className="font-semibold">Vendor Portal</div>
          </div>
          <button onClick={() => setOpen((s) => !s)} className="p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        {open && (
          <div className="px-4 pb-4">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-100">                
                  {item.icon}
                  <span>{item.name}</span>                
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Main area */}
      <main className="flex-1 flex flex-col">
        <header className="flex justify-between items-center px-8 py-4 bg-white shadow-sm border-b border-gray-100">
          <h1 className="text-xl font-semibold text-slate-700">Vendor Portal</h1>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              <div className="font-medium">Global Supply Co.</div>
              <div className="text-xs text-gray-400">contact@globalsupply.com</div>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 md:p-8 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}