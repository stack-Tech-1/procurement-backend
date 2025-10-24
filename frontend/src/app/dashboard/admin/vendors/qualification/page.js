// frontend/src/app/dashboard/admin/vendors/qualification/page.js
"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, Loader2, FileText, CheckCircle } from "lucide-react";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
// Import the component you'll use to view the full details (defined in Step 2)
import QualificationDetailModal from "./components/QualificationDetailModal"; 
import { useRouter } from "next/navigation"; 


// NOTE: Ensure NEXT_PUBLIC_API_URL is set in your .env file (e.g., http://localhost:4000)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    if (!token) {
        console.error("Authentication token not found in localStorage.");
        // Depending on your auth flow, you might want to redirect here
        // router.replace('/login'); 
        return {}; // Return empty headers if no token is available
    }
    
    return {
        headers: { 
            // The standard way to send a token is "Bearer <token>"
            Authorization: `Bearer ${token}` 
        },
    };
};

const formatDate = (isoString) => {
  if (!isoString) return "N/A";
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getStatusClasses = (status) => {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-700";
    case "PENDING":
      return "bg-yellow-100 text-yellow-700";
    case "REJECTED":
      return "bg-red-100 text-red-700";
    case "UNDER_REVIEW":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-200 text-gray-700";
  }
};

export default function QualificationReviewPage() {
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewingSubmission, setViewingSubmission] = useState(null);
  const router = useRouter();


 

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      // CALL THE NEW ADMIN API ENDPOINT
      const res = await axios.get(`${API_BASE_URL}/api/admin/submissions`, getAuthHeader());
      setSubmissions(res.data || []);
    } catch (err) {
      console.error("Submission fetch error:", err);
      setError("Failed to load submissions. Access denied or API error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token"); // Check for token
    
    if (!storedUser || !storedToken) {
        // ⛔ Critical Check: If no user or token, redirect to login
        router.replace("/login");
        return; 
    }
    
    const parsedUser = JSON.parse(storedUser);
    
    // 💡 Add Admin Role Check (Highly Recommended)
    if (parsedUser.role !== 'ADMIN') { 
         // Redirect non-admins away from this page
         router.replace("/dashboard"); 
         return;
    }
    
    setUser(parsedUser);
    fetchSubmissions();

    // Optionally re-fetch periodically
    const interval = setInterval(fetchSubmissions, 60000); // refresh every minute
    return () => clearInterval(interval);
}, [router]); 


  // --- Action Handlers (To be implemented later) ---
  const handleApprove = async (submissionId) => {
    if (!window.confirm("Are you sure you want to APPROVE this qualification?")) return;
    // TODO: Implement PUT call to /api/admin/submissions/approve/:id
    alert(`Approving submission ${submissionId}. (API call TBD)`);
  };

  const handleReject = async (submissionId) => {
    if (!window.confirm("Are you sure you want to REJECT this qualification?")) return;
    // TODO: Implement PUT call to /api/admin/submissions/reject/:id
    alert(`Rejecting submission ${submissionId}. (API call TBD)`);
  };


  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <Topbar user={user} />
        <div className="flex-1 p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <CheckCircle size={28} className="text-green-600" /> Vendor Qualification Review
            </h1>
            <p className="text-gray-500 mt-1">
              Review, approve, or reject new vendor qualification submissions.
            </p>
          </header>

          {/* Search */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div className="relative w-full md:w-96">
              <Search
                size={20}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by Company or CR Number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-green-500 focus:border-green-500 shadow-sm"
              />
            </div>
          </div>

          {error && (
            <div className="p-4 mb-4 bg-red-100 text-red-700 rounded-xl">{error}</div>
          )}

          {/* Table */}
          <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
            {loading ? (
              <div className="flex justify-center items-center h-64 text-gray-500 flex-col">
                <Loader2 className="animate-spin h-8 w-8 text-green-500 mb-3" />
                <p>Loading submissions...</p>
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="flex justify-center items-center h-64 text-gray-500 flex-col">
                <FileText size={48} className="mb-3" />
                <p className="text-lg font-medium">No pending qualifications found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Company Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        CR Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                        Submission Date
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredSubmissions.map((sub) => (
                      <tr key={sub.id}>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {sub.companyName}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {sub.crNumber || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {sub.vendorType || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-center text-gray-500">
                          {formatDate(sub.submissionDate)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`px-3 py-1 text-xs rounded-full font-medium ${getStatusClasses(
                              sub.status
                            )}`}
                          >
                            {sub.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => setViewingSubmission(sub)}
                              className="text-blue-600 hover:text-blue-800 p-1 border border-blue-200 rounded-lg transition"
                              title="View Details"
                            >
                              <FileText size={18} />
                            </button>
                            <button
                              onClick={() => handleApprove(sub.id)}
                              className="text-green-600 hover:text-green-800 p-1 border border-green-200 rounded-lg transition disabled:text-gray-400"
                              title="Approve"
                              disabled={sub.status !== 'PENDING' && sub.status !== 'UNDER_REVIEW'}
                            >
                              <CheckCircle size={18} />
                            </button>
                            {/* You might add a Reject button here */}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Detail Modal for viewing full submission data */}
      {viewingSubmission && (
        <QualificationDetailModal
          submission={viewingSubmission}
          onClose={() => setViewingSubmission(null)}
          // Pass the fetch function so it can refresh the list after an action
          onUpdate={fetchSubmissions} 
        />
      )}
    </div>
  );
}

// Ensure you create the components/QualificationDetailModal.js in the next step!