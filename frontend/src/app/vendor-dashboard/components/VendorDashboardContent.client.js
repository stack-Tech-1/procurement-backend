/* ---------- File: src/app/vendor/components/VendorDashboardContent.client.jsx ---------- */
"use client";
import React from 'react';
import { Briefcase, FileText, Loader2, CheckCircle2, X, ChevronRight } from 'lucide-react';

const mockProposals = [
  { id: 'P001', rfqRef: 'RFQ-2024-05-012', title: 'Supply of Cement & Aggregates', date: '2024-09-01', status: 'Pending Review', stage: 'Technical Evaluation' },
  { id: 'P002', rfqRef: 'RFQ-2024-04-045', title: 'HVAC System Installation Bid', date: '2024-08-15', status: 'Approved', stage: 'Contract Negotiation' },
  { id: 'P003', rfqRef: 'RFQ-2024-05-022', title: 'Office Furniture Procurement', date: '2024-09-20', status: 'Rejected', stage: 'Final Decision' },
  { id: 'P004', rfqRef: 'RFQ-2024-06-003', title: 'Electrical Cabling Supply', date: '2024-10-01', status: 'Draft', stage: 'Draft' },
];

const getStatusColor = (status) => {
  switch (status) {
    case 'Pending Review':
    case 'Technical Evaluation':
      return 'text-amber-700 bg-amber-100';
    case 'Approved':
    case 'Contract Negotiation':
    case 'Complete':
      return 'text-green-700 bg-green-100';
    case 'Rejected':
      return 'text-red-700 bg-red-100';
    case 'Draft':
    default:
      return 'text-gray-700 bg-gray-200';
  }
};

export default function VendorDashboardContent() {
  const stats = [
    { label: 'Total Proposals', value: mockProposals.length, icon: <FileText size={22} />, color: 'bg-indigo-500' },
    { label: 'Pending Review', value: mockProposals.filter(p => p.status === 'Pending Review').length, icon: <Loader2 size={22} />, color: 'bg-amber-500' },
    { label: 'Approved Bids', value: mockProposals.filter(p => p.status === 'Approved').length, icon: <CheckCircle2 size={22} />, color: 'bg-green-500' },
    { label: 'Rejected Bids', value: mockProposals.filter(p => p.status === 'Rejected').length, icon: <X size={22} />, color: 'bg-red-500' },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Welcome, Global Supply Co.</h1>

      <div className="p-5 rounded-xl shadow-lg flex justify-between items-center bg-amber-50 border border-amber-200">
        <div className='flex items-center gap-4'>
          <Briefcase size={30} className='text-amber-600' />
          <div>
            <p className="text-sm font-medium text-gray-500">Your Current Status</p>
            <p className={`text-xl font-semibold text-amber-800`}>Profile Under Review</p>
          </div>
        </div>
        <button className='text-sm font-semibold text-teal-600 hover:text-teal-700 p-2 rounded-lg bg-white shadow hover:shadow-md transition'>Review Profile</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((item) => (
          <div key={item.label} className="bg-white p-6 rounded-xl shadow hover:shadow-md transition flex items-center gap-4">
            <div className={`${item.color} p-3 rounded-lg text-white`}>{item.icon}</div>
            <div>
              <p className="text-sm text-gray-500">{item.label}</p>
              <p className="text-2xl font-semibold text-gray-800">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6 pt-4'>
        <div className='bg-indigo-50 p-6 rounded-xl border border-indigo-200'>
          <h3 className='text-xl font-semibold text-indigo-800 mb-2'>Track Your Bids</h3>
          <p className='text-gray-600 mb-4'>Quickly see the approval progress of your recent proposal submissions.</p>
        </div>
        <div className='bg-teal-50 p-6 rounded-xl border border-teal-200'>
          <h3 className='text-xl font-semibold text-teal-800 mb-2'>Submit New Proposal</h3>
          <p className='text-gray-600 mb-4'>Ready to submit a new bid for an RFQ? Get started here.</p>
        </div>
      </div>
    </div>
  );
}