// src/app/dashboard/vendor/profile/page.jsx

"use client";
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, AlertTriangle, FileText, CheckCircle, Edit, Save } from 'lucide-react';
import VendorQualificationForm from '@/components/VendorQualificationForm'; // Assuming this is your existing form component
import { toast } from 'react-hot-toast'; 

const API_BASE_URL = 'http://localhost:4000/api/vendor/qualification/me';

const VendorQualificationViewPage = () => {
    const [initialData, setInitialData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isEditing, setIsEditing] = useState(false); // Vendor can toggle edit mode

    // --- Helper Functions ---
    const getStatusColor = (status) => {
        switch (status) {
            case 'APPROVED': return 'bg-green-100 text-green-800 border-green-400';
            case 'REJECTED': return 'bg-red-100 text-red-800 border-red-400';
            case 'UNDER_REVIEW': 
            case 'NEW':
            default: return 'bg-yellow-100 text-yellow-800 border-yellow-400';
        }
    };
    
    // --- Data Fetching Logic ---
    const fetchQualificationData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token missing.");

            const response = await axios.get(API_BASE_URL, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const vendorData = response.data;
            setInitialData(vendorData);
            
            // Auto-set editing mode if NEW or REJECTED
            if (vendorData.status === 'NEW' || vendorData.status === 'REJECTED') {
                setIsEditing(true);
            } else {
                setIsEditing(false);
            }

        } catch (err) {
            console.error("Failed to fetch vendor qualification:", err);
            setError(err.response?.data?.error || 'Could not load qualification data.');
            toast.error(err.response?.data?.error || 'Failed to load qualification.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchQualificationData();
    }, [fetchQualificationData]);

    const handleSuccessfulSubmission = () => {
        toast.success("Qualification updated successfully and re-submitted for review!");
        // Re-fetch data to show the new 'UNDER_REVIEW' status
        fetchQualificationData();
    };

    // --- Render Logic (Loading, Error) ---
    if (loading) {
        return (
            <div className="p-8 flex justify-center items-center min-h-screen-minus-topbar bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="ml-3 text-lg text-gray-600">Loading your qualification profile...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center min-h-screen-minus-topbar bg-gray-50">
                <h1 className="text-3xl font-bold text-red-600 mb-4">Error Loading Profile</h1>
                <p className="text-gray-600">{error}</p>
                <button onClick={fetchQualificationData} className="mt-4 text-blue-600 hover:underline">Retry Loading</button>
            </div>
        );
    }

    if (!initialData) {
        return <div className="p-8 text-center text-gray-600">No qualification data found.</div>;
    }
    
    const { status, reviewNotes } = initialData;
    const canEdit = status === 'NEW' || status === 'REJECTED' || isEditing;

    // --- Main Render ---
    return (
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-50">
            <div className="max-w-6xl mx-auto">
                
                {/* Header and Status Block */}
                <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-blue-600 mb-6">
                    <div className="flex justify-between items-start">
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                            <FileText className="w-7 h-7 mr-3 text-blue-600" />
                            Vendor Qualification Profile
                        </h1>
                        <span className={`px-4 py-2 rounded-full text-sm font-bold border ${getStatusColor(status)}`}>
                            {status.replace(/_/g, ' ')}
                        </span>
                    </div>

                    {/* Status-Based Actions/Messages */}
                    <div className="mt-4 space-y-3">
                        {/* Display Review Notes if Rejected */}
                        {status === 'REJECTED' && reviewNotes && (
                            <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
                                <h3 className="font-bold text-red-800 flex items-center">
                                    <AlertTriangle className="w-5 h-5 mr-2" />
                                    Rejection Reason:
                                </h3>
                                <p className="text-sm text-red-700 mt-1">{reviewNotes}</p>
                            </div>
                        )}
                        
                        {/* Toggle Edit Button */}
                        {(status === 'APPROVED' || status === 'UNDER_REVIEW') && (
                             <div className="flex justify-end">
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                                        isEditing 
                                            ? 'bg-red-500 text-white hover:bg-red-600 flex items-center gap-1'
                                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1'
                                    }`}
                                >
                                    {isEditing ? (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Exit Edit Mode
                                        </>
                                    ) : (
                                        <>
                                            <Edit className="w-4 h-4" />
                                            Request Edit Access
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                        
                        {/* Status Message */}
                        {status === 'APPROVED' && (
                            <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-md">
                                <p className="text-green-800 flex items-center font-semibold">
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    Your qualification is **APPROVED**. You are a qualified supplier.
                                </p>
                            </div>
                        )}
                        {status === 'UNDER_REVIEW' && (
                            <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-md">
                                <p className="text-yellow-800 flex items-center font-semibold">
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Your qualification is currently **UNDER REVIEW** by the Procurement team.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Qualification Form/View */}
                {/* The VendorQualificationForm should handle both view and edit modes internally */}
                <VendorQualificationForm 
                    initialData={initialData}
                    isEditable={canEdit}
                    onSuccess={handleSuccessfulSubmission}
                />
            </div>
        </div>
    );
};

export default VendorQualificationViewPage;