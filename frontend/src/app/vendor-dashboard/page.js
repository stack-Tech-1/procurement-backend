/* ---------- File: src/app/vendor/page.jsx ---------- */
"use client";
import React from 'react';
import VendorDashboardContent from './components/VendorDashboardContent.client';

export default function VendorHome() {
  return (
    <div>
      {/* This page uses the VendorLayout wrapper defined in layout.jsx automatically */}
      {/* Use the exported dashboard component from components for maintainability */}
      <VendorDashboardContent />
    </div>
  );
}