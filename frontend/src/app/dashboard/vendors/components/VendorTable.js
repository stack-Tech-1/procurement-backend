"use client";
import { Eye, Edit3 } from "lucide-react";

export default function VendorTable({ vendors, onView, onEdit }) {
  // Helper function to determine badge styling
  const getStatusBadgeClasses = (status) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700";
      case "Under Review":
        return "bg-yellow-100 text-yellow-700"; // Added styling for new status
      case "Inactive":
      default:
        return "bg-gray-200 text-gray-700";
    }
  };

  return (
    <div className="bg-white shadow-md rounded-xl overflow-hidden">
      <table className="min-w-full table-auto">
        <thead className="bg-indigo-600 text-white">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-medium">Vendor Name</th>
            <th className="px-6 py-3 text-left text-sm font-medium">Email</th>
            <th className="px-6 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-6 py-3 text-center text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr key={vendor.id} className="border-t hover:bg-gray-50 transition">
              <td className="px-6 py-3">{vendor.name}</td>
              <td className="px-6 py-3">{vendor.email}</td>
              <td className="px-6 py-3">
                <span
                  className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeClasses(vendor.status)}`}
                >
                  {vendor.status}
                </span>
              </td>
              <td className="px-6 py-3 text-center flex justify-center space-x-4">
                <button
                  onClick={() => onView(vendor)}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  <Eye size={18} />
                </button>
                <button
                  onClick={() => onEdit(vendor)}
                  className="text-green-600 hover:text-green-800"
                >
                  <Edit3 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
