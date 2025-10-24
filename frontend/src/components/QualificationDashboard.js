// This file simulates the main administrative dashboard showing a list of pending qualification submissions.
// It includes logic to handle state updates after an approval or rejection is completed in a separate modal component.

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, XCircle, ChevronDown, ListFilter, Search, Loader2 } from 'lucide-react';

// Removed mockSubmissionsData since we are now fetching data

// --- Mock Review Modal Component (Simplified) ---
// In a real app, this is where the actual API calls to your backend/routes/qualification.routes.js 
// would be made using the submission ID, notes, and the selected action (approve/reject).

const ReviewModal = ({ submission, onClose, onReviewComplete }) => {
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null); // State for displaying API errors

    if (!submission) return null;

    /**
     * Handles the actual API call to PUT /api/admin/submissions/:id/approve or /reject.
     * @param {string} action - 'APPROVED' or 'REJECTED'
     */
    const handleReviewAction = async (action) => {
        setError(null);
        setLoading(true);
        const endpoint = action === 'APPROVED' ? 'approve' : 'reject';
        const apiUrl = `/api/admin/submissions/${submission.id}/${endpoint}`;
        
        try {
            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    // In a production app, you would include an Authorization header here
                },
                body: JSON.stringify({ notes }),
            });

            if (!response.ok) {
                // Read the error message from the backend response
                const errorData = await response.json();
                throw new Error(errorData.message || `API call failed with status ${response.status}`);
            }

            // On successful response: call the dashboard's handler to update the UI
            console.log(`[FRONTEND SUCCESS] ${action} for ID: ${submission.id}`);
            onReviewComplete(submission.id, action, notes);
            onClose();

        } catch (err) {
            console.error('API Error:', err.message);
            setError(`Review failed: ${err.message}. Please check the console for details.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 transform transition duration-300">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Review Submission: {submission.id}</h2>
                <p className="text-sm text-gray-600 mb-4">
                    Vendor: <span className="font-semibold">{submission.vendorName}</span> (Category: {submission.category})
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="mb-4">
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                        Review Notes (Required for Rejection)
                    </label>
                    <textarea
                        id="notes"
                        rows="4"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        placeholder="Detail your findings and decision reason..."
                        disabled={loading}
                    ></textarea>
                </div>
                
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition duration-150"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => handleReviewAction('REJECTED')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition duration-150 flex items-center ${
                            loading ? 'bg-red-300' : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                        disabled={loading || notes.trim().length === 0} // Notes required for rejection
                    >
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                        Reject
                    </button>
                    <button
                        onClick={() => handleReviewAction('APPROVED')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition duration-150 flex items-center ${
                            loading ? 'bg-green-300' : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                        Approve
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main Dashboard Component ---

const App = () => {
    // State to hold the list of pending submissions
    const [submissions, setSubmissions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    // State to hold the submission currently selected for review (opens the modal)
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [notes, setNotes] = useState('');

    /**
     * Replaces the mock data logic with a real fetch call to the backend 
     * endpoint for pending submissions.
     */
    const fetchSubmissions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            console.log("[FRONTEND] Fetching pending submissions from /api/admin/submissions/pending...");
            
            const response = await fetch('/api/admin/submissions/pending', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    // Add your Authorization header here
                },
            });

            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.message || `Failed to fetch submissions with status ${response.status}`);
            }

            const data = await response.json();
            // Assuming the backend returns an array of submissions that are PENDING
            setSubmissions(data); 

        } catch (err) {
            console.error('Fetch Error:', err.message);
            // In a real application, you might show a persistent error notification here
            // For now, we'll log it and set an empty array to prevent rendering issues.
            setSubmissions([]); 
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // Initial data load on component mount
        fetchSubmissions();
    }, [fetchSubmissions]);


    /**
     * THE CORE REFRESH LOGIC:
     * Called by the ReviewModal after a successful API call (Approve/Reject).
     * This immediately updates the UI without a full page refresh.
     * @param {string} submissionId - The ID of the submission that was just processed.
     * @param {string} newStatus - The resulting status ('APPROVED' or 'REJECTED').
     */
    const handleReviewComplete = (submissionId, newStatus, notes) => {
        console.log(`[DASHBOARD] Review complete for ID: ${submissionId}. Status: ${newStatus}`);
        
        // Immediate local state update: Filter out the completed submission 
        // since it is no longer 'PENDING' and shouldn't appear on this dashboard.
        setSubmissions(prevSubmissions => 
            prevSubmissions.filter(sub => sub.id !== submissionId)
        );

        console.log(`Success: Submission ${submissionId} has been marked as ${newStatus}.`);
    };


    const openReviewModal = (submission) => {
        setSelectedSubmission(submission);
    };

    const closeReviewModal = () => {
        setSelectedSubmission(null);
        setNotes(''); // Clear notes state upon closing
    };

    const statusClasses = {
        'PENDING': 'bg-yellow-100 text-yellow-800',
        'APPROVED': 'bg-green-100 text-green-800',
        'REJECTED': 'bg-red-100 text-red-800',
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6 font-sans">
            <script src="https://cdn.tailwindcss.com"></script>
            {/* Header */}
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-gray-900">Admin Qualification Review</h1>
                <p className="text-gray-500">Manage pending vendor submissions requiring approval.</p>
            </header>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search vendors..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                        />
                    </div>
                    <button 
                        onClick={fetchSubmissions}
                        className="p-2 bg-white border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-100 transition duration-150"
                        title="Refresh Data"
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
                    </button>
                </div>

                <div className="flex items-center space-x-3">
                    <button className="flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-xl hover:bg-blue-200 transition duration-150">
                        <ListFilter className="w-4 h-4 mr-2" />
                        Filter Status
                        <ChevronDown className="w-4 h-4 ml-2" />
                    </button>
                </div>
            </div>

            {/* Submissions Table */}
            <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Documents</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isLoading ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                                    <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-500" />
                                    Loading submissions...
                                </td>
                            </tr>
                        ) : submissions.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                                    No pending submissions found. Great job!
                                </td>
                            </tr>
                        ) : (
                            submissions.map((sub) => (
                                <tr key={sub.id} className="hover:bg-gray-50 transition duration-150">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sub.vendorName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.submittedAt}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.documents}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClasses[sub.status]}`}>
                                            {sub.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => openReviewModal(sub)}
                                            className="text-blue-600 hover:text-blue-900 font-semibold p-2 rounded-lg hover:bg-blue-50 transition duration-150"
                                        >
                                            Review
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Review Modal */}
            <ReviewModal 
                submission={selectedSubmission}
                onClose={closeReviewModal}
                onReviewComplete={handleReviewComplete} // This links the modal completion back to the dashboard state
            />

        </div>
    );
};

export default App;
