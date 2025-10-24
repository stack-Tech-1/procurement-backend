// src/app/dashboard/procurement/vendors/[id]/page.jsx

"use client";
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';
import {
    Building2, FileText, CheckCircle, Clock, XCircle,
    User, Mail, Phone, MapPin, Loader2, Save, Send,
    FileText as FileIcon, Calendar, Hash
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:4000/api/vendors'; 
const REVIEW_ENDPOINT = 'http://localhost:4000/api/vendors/status'; 

// --- Helper Components ---

const SectionHeader = ({ title, icon: Icon, className = "" }) => (
    <div className={`flex items-center space-x-3 pb-3 border-b-2 border-blue-100/70 mb-6 ${className}`}>
        {Icon && <Icon className="w-6 h-6 text-blue-600" />}
        <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">
            {title}
        </h2>
    </div>
);

const DetailItem = ({ label, value, icon: Icon, colorClass = "text-gray-700" }) => (
    <div className="flex flex-col p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center text-sm font-medium text-gray-500">
            {Icon && <Icon className="w-4 h-4 mr-2 text-blue-500" />}
            {label}
        </div>
        <p className={`mt-1 font-semibold ${colorClass} text-base`}>{value || 'N/A'}</p>
    </div>
);

const getStatusColor = (status) => {
    switch (status) {
        case 'APPROVED': return 'bg-green-100 text-green-800 border-green-400';
        case 'REJECTED': return 'bg-red-100 text-red-800 border-red-400';
        case 'UNDER_REVIEW': 
        case 'NEW':
        default: return 'bg-yellow-100 text-yellow-800 border-yellow-400';
    }
};

// --- Main Component ---
const VendorDetailPage = () => {
    const params = useParams();
    const router = useRouter();
    const vendorId = params.id; 

    const [vendor, setVendor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Review Form State
    const [reviewStatus, setReviewStatus] = useState('');
    const [reviewNotes, setReviewNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState(null);

    // --- Data Fetching Logic ---
    const fetchVendorDetails = useCallback(async () => {
        if (!vendorId) return;
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error("Authentication token missing.");

            const response = await axios.get(`${API_BASE_URL}/${vendorId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setVendor(response.data);
            setReviewStatus(response.data.status); // Initialize form with current status
        } catch (err) {
            console.error("Failed to fetch vendor details:", err);
            setError(err.response?.data?.error || err.message || 'Could not load vendor data.');
        } finally {
            setLoading(false);
        }
    }, [vendorId]);

    useEffect(() => {
        fetchVendorDetails();
    }, [fetchVendorDetails]);
    
    // --- Review Submission Logic ---
    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!reviewStatus || !reviewNotes) {
            setSubmitMessage({ type: 'error', text: 'Status and Review Notes are required.' });
            return;
        }

        setIsSubmitting(true);
        setSubmitMessage(null);
        
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token missing.");

            // The endpoint expects the vendor's database ID, not the custom vendorId
            // The list page uses vendor.id in the URL, which is the database ID.
            const response = await axios.post(`${REVIEW_ENDPOINT}/${vendor.id}/status`, 
                { newStatus: reviewStatus, reviewNotes },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setSubmitMessage({ type: 'success', text: `Vendor status updated to ${reviewStatus}.` });
            // Re-fetch data to update the view
            fetchVendorDetails(); 

        } catch (err) {
            console.error("Failed to update status:", err);
            setSubmitMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update vendor status.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // --- Render Logic (Loading, Error, Not Found) ---
    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center min-h-screen-minus-topbar bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="ml-3 text-lg text-gray-600">Loading vendor details...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center min-h-screen-minus-topbar bg-gray-50">
                <h1 className="text-3xl font-bold text-red-600 mb-4">Error</h1>
                <p className="text-gray-600">{error}</p>
                <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:underline">Go Back</button>
            </div>
        );
    }

    if (!vendor) {
        return <div className="p-8 text-center text-gray-600">Vendor not found.</div>;
    }


    // --- Document Rendering Helper ---
    const renderDocuments = () => {
        if (!vendor.documents || vendor.documents.length === 0) {
            return <p className="text-gray-500 italic">No documents submitted.</p>;
        }

        return (
            <div className="space-y-4">
                {vendor.documents.map(doc => (
                    <div key={doc.id} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 border border-gray-200 rounded-lg hover:bg-white transition">
                        <div className="col-span-1 md:col-span-2 flex items-center">
                            <FileIcon className="w-5 h-5 mr-3 text-blue-500 flex-shrink-0" />
                            <span className="font-semibold text-gray-800">{doc.docType.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="text-sm text-gray-600 flex items-center">
                            <Calendar className="w-4 h-4 mr-1 text-gray-400" />
                            Exp: {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : 'N/A'}
                        </div>
                        <div className="text-sm text-gray-600 flex items-center">
                            <Hash className="w-4 h-4 mr-1 text-gray-400" />
                            No: {doc.documentNumber || 'N/A'}
                        </div>
                        <div className="col-span-1 md:col-span-1 text-right">
                            <a 
                                href={doc.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-blue-600 hover:text-blue-800 transition font-medium"
                            >
                                View File
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        );
    };
    
    // --- Project Experience Rendering Helper ---
    const renderProjects = () => {
        if (!vendor.projectExperience || vendor.projectExperience.length === 0) {
            return <p className="text-gray-500 italic">No project experience provided.</p>;
        }

        return (
            <div className="space-y-4">
                {vendor.projectExperience.map(project => (
                    <div key={project.id} className="p-5 bg-white rounded-xl shadow-sm border border-gray-100">
                        <h4 className="text-lg font-bold text-blue-600">{project.projectName}</h4>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <DetailItem label="Client Name" value={project.clientName} icon={User} />
                            <DetailItem label="Contract Value" value={`${project.contractValue?.toLocaleString()} SAR`} icon={Save} />
                            <DetailItem label="Start Date" value={project.startDate ? new Date(project.startDate).toLocaleDateString() : 'N/A'} icon={Calendar} />
                            <DetailItem label="End Date" value={project.endDate ? new Date(project.endDate).toLocaleDateString() : 'N/A'} icon={Calendar} />
                        </div>
                        <p className="mt-3 text-sm text-gray-700">
                            <span className="font-semibold">Scope:</span> {project.scopeDescription}
                        </p>
                        <div className="mt-3 text-right">
                            <a 
                                href={project.completionFile} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-blue-600 hover:text-blue-800 transition font-medium text-sm"
                            >
                                View Completion File
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // --- Main Detail View Render ---
    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-50">
            <div className="max-w-7xl mx-auto space-y-8">
                
                {/* Header and Status */}
                <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-blue-600">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-4xl font-extrabold text-gray-900">
                            {vendor.name}
                        </h1>
                        <span className={`px-4 py-2 rounded-full text-sm font-bold border ${getStatusColor(vendor.status)}`}>
                            {vendor.status.replace(/_/g, ' ')}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <DetailItem label="Vendor ID" value={vendor.vendorId} icon={Hash} />
                        <DetailItem label="Vendor Type" value={vendor.vendorType} icon={Building2} />
                        <DetailItem label="CR Number" value={vendor.crNumber} icon={Hash} />
                        <DetailItem label="Last Update" value={new Date(vendor.updatedAt).toLocaleDateString()} icon={Clock} />
                    </div>
                </div>

                {/* Main Content (Details & Review Panel) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Left Column: Vendor Details */}
                    <div className="lg:col-span-2 space-y-8">
                        
                        {/* A. Company Information */}
                        <section className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                            <SectionHeader title="A. Company Information" icon={Building2} />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <DetailItem label="Business Type" value={vendor.businessType} />
                                <DetailItem label="Years in Business" value={vendor.yearsInBusiness} />
                                <DetailItem label="GOSI Employee Count" value={vendor.gosiEmployeeCount} />
                                <DetailItem label="Products/Services" value={vendor.productsAndServices?.join(', ')} colorClass="text-black" />
                            </div>
                        </section>

                        {/* B. Contact Information */}
                        <section className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                            <SectionHeader title="B. Contact Information" icon={User} />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <DetailItem label="Primary Contact" value={`${vendor.primaryContactName} (${vendor.primaryContactTitle})`} icon={User} />
                                <DetailItem label="Contact Email" value={vendor.contactEmail} icon={Mail} />
                                <DetailItem label="Contact Phone" value={vendor.contactPhone} icon={Phone} />
                                <DetailItem label="Address" value={`${vendor.addressStreet}, ${vendor.addressCity}, ${vendor.addressCountry}`} icon={MapPin} colorClass="text-black" />
                            </div>
                        </section>

                        {/* C. Documents */}
                        <section className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                            <SectionHeader title="C. Document Checklist & Uploads" icon={FileIcon} />
                            {renderDocuments()}
                        </section>

                        {/* D. Project Experience */}
                        <section className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                            <SectionHeader title="D. Project Experience" icon={FileText} />
                            {renderProjects()}
                        </section>
                        
                    </div>
                    
                    {/* Right Column: Review Panel */}
                    <div className="lg:col-span-1">
                        <form onSubmit={handleReviewSubmit} className="sticky top-4 bg-blue-50 p-6 rounded-xl shadow-xl border border-blue-200 space-y-5">
                            <SectionHeader title="Qualification Review" icon={CheckCircle} className="mb-4" />
                            
                            {/* Current Status */}
                            <div className="p-3 border-l-4 border-blue-500 bg-white rounded-lg">
                                <p className="text-sm font-medium text-gray-500">Current Status</p>
                                <p className={`text-lg font-bold mt-1 ${vendor.status === 'APPROVED' ? 'text-green-600' : vendor.status === 'REJECTED' ? 'text-red-600' : 'text-yellow-600'}`}>
                                    {vendor.status.replace(/_/g, ' ')}
                                </p>
                            </div>

                            {/* Status Select */}
                            <div>
                                <label htmlFor="reviewStatus" className="block text-sm font-medium text-gray-700 mb-1">
                                    New Status *
                                </label>
                                <select
                                    id="reviewStatus"
                                    value={reviewStatus}
                                    onChange={(e) => setReviewStatus(e.target.value)}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm appearance-none bg-white cursor-pointer"
                                    required
                                >
                                    <option value="">-- Select Action --</option>
                                    <option value="APPROVED">Approve Qualification</option>
                                    <option value="REJECTED">Reject Qualification</option>
                                    <option value="UNDER_REVIEW">Set to Under Review</option>
                                </select>
                            </div>
                            
                            {/* Review Notes */}
                            <div>
                                <label htmlFor="reviewNotes" className="block text-sm font-medium text-gray-700 mb-1">
                                    Review Notes * (Mandatory for status change)
                                </label>
                                <textarea
                                    id="reviewNotes"
                                    rows="5"
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                                    placeholder="Enter detailed reasons for approval or rejection..."
                                    required
                                ></textarea>
                            </div>
                            
                            {/* Submission Feedback */}
                            {submitMessage && (
                                <div className={`p-3 rounded-lg text-sm font-medium ${submitMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {submitMessage.text}
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`w-full px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-white transition duration-150 shadow-md ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-green-500/50'}`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        Update Vendor Status
                                    </>
                                )}
                            </button>
                            
                            <p className="text-xs text-gray-500 mt-2 text-center">
                                *Submitting a new status will override the current one.
                            </p>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default VendorDetailPage;