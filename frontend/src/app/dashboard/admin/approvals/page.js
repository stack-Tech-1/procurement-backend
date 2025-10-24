"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default function AdminApprovalsPage() {
  const [user, setUser] = useState(null);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [error, setError] = useState("");

  const API_BASE_URL = "http://localhost:4000"; 
  
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));

    fetchPendingUsers();

    // ✅ Auto-refresh every 30 seconds
    const interval = setInterval(fetchPendingUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPendingUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/pending`);
      setPendingUsers(res.data);
    } catch (err) {
      console.error("Error fetching pending users:", err);
      setError("Failed to fetch pending users");
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (id) => {
    try {
      setApproving(id);
      await axios.put(`${API_BASE_URL}/api/auth/approve/${id}`);
      setPendingUsers((prev) => prev.filter((user) => user.id !== id));
    } catch (err) {
      console.error(err);
      setError("Approval failed");
    } finally {
      setApproving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center">
          <p className="text-gray-500">Loading pending users...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <Topbar user={user} />

        <div className="px-8 py-6">
          <h1 className="text-2xl font-bold mb-6 text-gray-800">
            Pending Staff Approvals
          </h1>

          {error && <p className="text-red-500 mb-4">{error}</p>}

          {pendingUsers.length === 0 ? (
            <p className="text-gray-500">No pending approvals at the moment.</p>
          ) : (
            <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Requested Role</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((user) => (
                  <tr key={user.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">{user.name}</td>
                    <td className="px-4 py-2">{user.email}</td>
                    <td className="px-4 py-2 capitalize">
                      {user.role?.name || "Staff"}
                    </td>
                    <td className="px-4 py-2 text-yellow-600 font-medium">
                      {user.status}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => approveUser(user.id)}
                        disabled={approving === user.id}
                        className={`px-4 py-2 rounded-lg text-white ${
                          approving === user.id
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        {approving === user.id ? "Approving..." : "Approve"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
