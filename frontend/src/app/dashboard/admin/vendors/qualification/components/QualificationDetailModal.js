"use client";

import { X, CheckCircle, Ban, Loader2, FileText, Download } from "lucide-react";
import { useState } from "react";
import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// Helper function to get the authorization header
const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    if (!token) return {};
    return {
        headers: {
            Authorization: `Bearer ${token}`
        },
    };
};

// Reusable component for displaying a section title
const DetailSection = ({ title, children }) => (
    <div className="mb-4 p-4 border border-gray-100 rounded-xl bg-white shadow-sm">
        <h3 className="text-xl font-bold text-gray-800 border-b pb-2 mb-3">{title}</h3>
        {children}
    </div>
);

// Reusable component for displaying a detail row
const DetailItem = ({ label, value }) => (
    <div className="flex justify-between items-start py-2 border-b border-gray-100 last:border-b-0">
        <span className="text-sm font-medium text-gray-500 w-1/3">{label}:</span>
        <span className="text-sm text-gray-800 w-2/3 text-right font-mono break-all">{value || 'N/A'}</span>
    </div>
);

// Helper function for status classes (to display status clearly in the modal)
const getStatusClasses = (status) => {
    switch (status) {
        case "APPROVED": return "text-green-700 bg-green-100";
        case "PENDING": return "text-yellow-700 bg-yellow-100";
        case "REJECTED": return "text-red-700 bg-red-100";
        case "UNDER_REVIEW": return "text-blue-700 bg-blue-100";
        default: return "text-gray-700 bg-gray-100";
    }
};


export default function QualificationDetailModal({ submission, onClose, onUpdate }) {
    const [isProcessing, setIsProcessing] = useState(false);
    // State to hold the reviewer's notes
    const [reviewNotes, setReviewNotes] = useState("");

    // --- Action Handler: APPROVE or REJECT ---
    const handleAction = async (actionType) => {
        if (isProcessing) return;

        let message = actionType === 'APPROVE' 
            ? "Are you sure you want to APPROVE this qualification?"
            : "Are you sure you want to REJECT this qualification?";

        if (!window.confirm(message)) return;

        // Validation for rejection notes
        if (actionType === 'REJECT' && reviewNotes.trim() === '') {
            alert("Rejection requires mandatory reviewer notes.");
            return;
        }

        setIsProcessing(true);
        // Uses dedicated API endpoints: /approve or /reject
        const endpoint = `${API_BASE_URL}/api/admin/submissions/${submission.id}/${actionType.toLowerCase()}`;
        
        try {
            await axios.put(endpoint, { notes: reviewNotes }, getAuthHeader());
            
            // Success: Close modal and refresh the list
            onClose();
            onUpdate(); 
            // NOTE: Using a custom modal/toast is better than alert(), but using alert() here for simplicity based on the previous code
            alert(`Submission ${submission.crNumber} successfully ${actionType}D.`);

        } catch (error) {
            console.error(`Error ${actionType}ing submission:`, error);
            // Attempt to extract a user-friendly error message
            const errMsg = error.response?.data?.message || `Failed to ${actionType.toLowerCase()} submission.`;
            alert(`Error: ${errMsg}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    // Determine the review status
    const isApproved = submission.status === 'APPROVED';
    const isRejected = submission.status === 'REJECTED';
    const isFinalized = isApproved || isRejected;
    const canReview = !isFinalized; // Can only take action if not already finalized

    if (!submission) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Modal Header */}
                <div className="sticky top-0 bg-white px-6 py-4 border-b flex justify-between items-center z-10">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={24} className="text-blue-600" />
                        Review: {submission.companyName}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition p-1">
                        <X size={28} />
                    </button>
                </div>

                {/* Modal Body (Scrollable) */}
                <div className="flex-1 p-6 overflow-y-auto bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Column 1: Core Details */}
                        <div className="space-y-6">
                            <DetailSection title="Company Information">
                                <DetailItem label="CR Number" value={submission.crNumber} />
                                <DetailItem label="Vendor Type" value={submission.vendorType} />
                                <DetailItem label="Years in Business" value={submission.yearsInBusiness} />
                                <DetailItem label="Contact Email" value={submission.contactEmail} />
                                <DetailItem label="Contact Phone" value={submission.contactPhone} />
                                <DetailItem label="Country" value={submission.country} />
                            </DetailSection>

                            <DetailSection title="Submission Status & History">
                                <DetailItem label="Current Status" 
                                    value={
                                        <span className={`font-bold ${getStatusClasses(submission.status)} px-2 py-0.5 rounded-full text-xs`}>
                                            {submission.status.replace(/_/g, ' ')}
                                        </span>
                                    }
                                />
                                <DetailItem label="Submitted On" value={new Date(submission.submissionDate).toLocaleString()} />
                                <DetailItem label="Reviewed By" value={submission.reviewedBy || 'N/A'} />
                                <DetailItem label="Last Action" value={submission.lastActionDate ? new Date(submission.lastActionDate).toLocaleString() : 'N/A'} />
                            </DetailSection>
                        </div>
                        
                        {/* Column 2: Documents and Actions */}
                        <div className="space-y-6">
                            <DetailSection title="Attached Documents">
                                {submission.documents && submission.documents.length > 0 ? (
                                    <ul className="space-y-2">
                                        {submission.documents.map((doc, index) => (
                                            <li key={index} className="flex justify-between items-center p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition duration-150">
                                                <span className="text-sm text-gray-700 font-medium truncate">
                                                    {doc.documentName || `Document ${index + 1}`}
                                                </span>
                                                {/* NOTE: Assuming 'fileUrl' is a pre-signed or public URL. 
                                                     For security, a dedicated API to generate a temporary signed URL would be better. */}
                                                <a
                                                    href={doc.fileUrl} 
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-indigo-600 hover:text-indigo-800 flex items-center text-sm gap-1 font-semibold"
                                                >
                                                    Download <Download size={14} />
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No documents attached.</p>
                                )}
                            </DetailSection>

                            {/* Reviewer Action Area */}
                            <DetailSection title="Reviewer Notes & Actions">
                                {isFinalized ? (
                                    <p className={`font-bold p-3 rounded-lg text-center ${isApproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        Status: **{submission.status.replace(/_/g, ' ')}**
                                        <br/>
                                        <span className="font-normal italic text-sm">Reviewer Notes: {submission.reviewNotes || 'N/A'}</span>
                                    </p>
                                ) : (
                                    <>
                                        <label htmlFor="reviewNotes" className="block text-sm font-medium text-gray-700 mb-2">
                                            Review Notes (Mandatory for Rejection)
                                        </label>
                                        <textarea
                                            id="reviewNotes"
                                            rows="4"
                                            value={reviewNotes}
                                            onChange={(e) => setReviewNotes(e.target.value)}
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm transition"
                                            placeholder="Enter your justification for approval or rejection. Notes are saved upon approval/rejection."
                                        />
                                        
                                        <div className="flex justify-end gap-3 mt-4">
                                            <button
                                                onClick={() => handleAction('REJECT')}
                                                disabled={isProcessing || !canReview || (reviewNotes.trim() === '' && !isApproved)} // Require notes for reject
                                                className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition disabled:bg-gray-400 shadow-md"
                                            >
                                                {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Ban size={20} />}
                                                {isProcessing ? 'Processing...' : 'Reject'}
                                            </button>
                                            <button
                                                onClick={() => handleAction('APPROVE')}
                                                disabled={isProcessing || !canReview}
                                                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 shadow-md"
                                            >
                                                {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                                                {isProcessing ? 'Processing...' : 'Approve'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </DetailSection>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="sticky bottom-0 bg-white p-4 border-t flex justify-end">
                    <button 
                        onClick={onClose}
                        disabled={isProcessing}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
