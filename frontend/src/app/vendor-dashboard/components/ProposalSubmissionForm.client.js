/* ---------- File: src/app/vendor/components/ProposalSubmissionForm.client.jsx ---------- */
"use client";
import React, { useState } from 'react';
import { Briefcase, Send, Loader2, CheckCircle2 } from 'lucide-react';

export default function ProposalSubmissionForm() {
  const [formData, setFormData] = useState({ rfqRef: '', title: '', proposalFile: null, price: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData({ ...formData, [name]: files ? files[0] : value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.rfqRef || !formData.title || !formData.proposalFile) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSuccess(true);
      setFormData({ rfqRef: '', title: '', proposalFile: null, price: '' });
    }, 1500);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Briefcase size={24} className="text-teal-600" /> Submit New Proposal / Bid
      </h2>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl mb-4 flex items-center gap-3">
          <CheckCircle2 size={20} />
          <p className='font-medium'>Proposal submitted successfully! You can track its status in the Proposal Tracking section.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="rfqRef" className="block text-sm font-medium text-gray-700 mb-1">RFQ Reference Number <span className="text-red-500">*</span></label>
          <input type="text" id="rfqRef" name="rfqRef" value={formData.rfqRef} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="e.g., RFQ-2024-05-012" required />
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Proposal Title / Scope <span className="text-red-500">*</span></label>
          <input type="text" id="title" name="title" value={formData.title} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="e.g., Technical Bid for Electrical Works" required />
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">Total Quoted Price (SAR)</label>
            <input type="number" id="price" name="price" value={formData.price} onChange={handleChange} className="w-full p-3 border border-gray-300 rounded-lg" placeholder="e.g., 250000" />
          </div>
          <div>
            <label htmlFor="proposalFile" className="block text-sm font-medium text-gray-700 mb-1">Upload Proposal Document (PDF/DOC) <span className="text-red-500">*</span></label>
            <input type="file" id="proposalFile" name="proposalFile" onChange={handleChange} className="w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 p-3 border border-gray-300 rounded-lg" accept=".pdf,.doc,.docx" required />
          </div>
        </div>

        <button type="submit" disabled={isSubmitting} className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg shadow-md text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition disabled:bg-teal-400">
          {isSubmitting ? (<><Loader2 className="animate-spin" size={20} /> Submitting...</>) : (<><Send size={20} /> Finalize & Submit Proposal</>)}
        </button>
      </form>
    </div>
  );
}