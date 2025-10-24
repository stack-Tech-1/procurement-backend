/* ---------- File: src/app/vendor/tracker/page.jsx ---------- */
"use client";
import React from 'react';
import ProposalTrackingTable from '../components/ProjectExperienceTable.js';

const mockProposals = [
  { id: 'P001', rfqRef: 'RFQ-2024-05-012', title: 'Supply of Cement & Aggregates', date: '2024-09-01', status: 'Pending Review', stage: 'Technical Evaluation' },
  { id: 'P002', rfqRef: 'RFQ-2024-04-045', title: 'HVAC System Installation Bid', date: '2024-08-15', status: 'Approved', stage: 'Contract Negotiation' },
  { id: 'P003', rfqRef: 'RFQ-2024-05-022', title: 'Office Furniture Procurement', date: '2024-09-20', status: 'Rejected', stage: 'Final Decision' },
];

export default function VendorTracker() {
  return (
    <div className="max-w-6xl mx-auto">
      <ProposalTrackingTable proposals={mockProposals} />
    </div>
  );
}