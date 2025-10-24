"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, Plus, Loader2, Users, Eye, Pencil, Trash2 } from "lucide-react";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import AddVendorModal from "./components/AddVendorModal";
import EditVendorModal from "./components/EditVendorModal";
import VendorDetailModal from "./components/VendorDetailModal";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

const formatDate = (isoString) => {
  if (!isoString) return "N/A";
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getStatusClasses = (status) => {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-700";
    case "Inactive":
      return "bg-red-100 text-red-700";
    case "On Hold":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-200 text-gray-700";
  }
};

export default function VendorsPage() {
  const [user, setUser] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [viewingVendor, setViewingVendor] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const showMessage = (msg, isError = false) => {
    setMessage({ text: msg, isError });
    setTimeout(() => setMessage(null), 5000);
  };

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE_URL}/api/vendors`, getAuthHeader());
      setVendors(res.data || []);
    } catch (err) {
      console.error("Vendor fetch error:", err);
      setError("Failed to load vendors. Check API connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
    fetchVendors();
  }, []);

  const handleAddVendor = async (newVendorData) => {
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/vendors`, newVendorData, getAuthHeader());
      setVendors((prev) => [...prev, res.data]);
      showMessage("Vendor added successfully!");
      setIsAddModalOpen(false);
    } catch (err) {
      console.error("Add vendor error:", err);
      showMessage(err.response?.data?.message || "Failed to add vendor.", true);
    } finally {
      setSaving(false);
    }
  };

  const handleEditVendor = async (updatedVendor) => {
    setSaving(true);
    try {
      const res = await axios.put(
        `${API_BASE_URL}/vendors/${updatedVendor._id}`,
        updatedVendor,
        getAuthHeader()
      );
      setVendors((prev) =>
        prev.map((v) => (v._id === updatedVendor._id ? res.data : v))
      );
      showMessage("Vendor updated successfully!");
      setEditingVendor(null);
    } catch (err) {
      console.error("Edit vendor error:", err);
      showMessage(err.response?.data?.message || "Failed to update vendor.", true);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVendor = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/vendors/${id}`, getAuthHeader());
      setVendors((prev) => prev.filter((v) => v._id !== id));
      showMessage("Vendor deleted successfully!");
    } catch (err) {
      console.error("Delete vendor error:", err);
      showMessage(err.response?.data?.message || "Failed to delete vendor.", true);
    }
  };

  const filteredVendors = useMemo(() => {
    if (!searchTerm) return vendors;
    const q = searchTerm.toLowerCase();
    return vendors.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q) ||
        v.category?.toLowerCase().includes(q)
    );
  }, [vendors, searchTerm]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <Topbar user={user} />
        <div className="flex-1 p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <Users size={28} className="text-indigo-600" /> Vendor Master List
            </h1>
            <p className="text-gray-500 mt-1">
              Manage and track all registered vendors.
            </p>
          </header>

          {/* Search + Add Button */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div className="relative w-full md:w-80">
              <Search
                size={20}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search vendors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
              />
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg"
            >
              <Plus size={20} /> Add Vendor
            </button>
          </div>

          {message && (
            <div
              className={`p-4 mb-4 rounded-xl ${
                message.isError
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {message.text}
            </div>
          )}
          {error && !message && (
            <div className="p-4 mb-4 bg-red-100 text-red-700 rounded-xl">
              {error}
            </div>
          )}

          {/* Table */}
          <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
            {loading ? (
              <div className="flex justify-center items-center h-64 text-gray-500 flex-col">
                <Loader2 className="animate-spin h-8 w-8 text-indigo-500 mb-3" />
                <p>Loading vendors...</p>
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="flex justify-center items-center h-64 text-gray-500 flex-col">
                <Search size={48} className="mb-3" />
                <p className="text-lg font-medium">No vendors found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                        Email
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                        Registered
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredVendors.map((vendor) => (
                      <tr key={vendor._id}>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {vendor.name}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                        {vendor.categories?.map(c => c.name).join(", ") || "N/A"}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {vendor.email}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`px-3 py-1 text-xs rounded-full font-medium ${getStatusClasses(
                              vendor.status
                            )}`}
                          >
                            {vendor.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-gray-500">
                          {formatDate(vendor.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-3">
                            <button
                              onClick={() => setViewingVendor(vendor)}
                              className="text-indigo-600 hover:text-indigo-800"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => setEditingVendor(vendor)}
                              className="text-green-600 hover:text-green-800"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteVendor(vendor._id, vendor.name)
                              }
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 size={18} />
                            </button>
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

      {/* Modals */}
      {isAddModalOpen && (
        <AddVendorModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={handleAddVendor}
          saving={saving}
        />
      )}
      {editingVendor && (
        <EditVendorModal
          vendor={editingVendor}
          onClose={() => setEditingVendor(null)}
          onSave={handleEditVendor}
          saving={saving}
        />
      )}
      {viewingVendor && (
        <VendorDetailModal
          vendor={viewingVendor}
          onClose={() => setViewingVendor(null)}
        />
      )}
    </div>
  );
}
