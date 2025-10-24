"use client";
import { X, Mail, Phone, Tag, MapPin, User, Clock } from "lucide-react";

const formatDate = (isoString) => {
  if (!isoString) return "N/A";
  return new Date(isoString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function VendorDetailModal({ vendor, onClose }) {
  if (!vendor) return null;

  const getStatusClasses = (status) => {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700";
      case "Inactive":
        return "bg-red-100 text-red-700";
      case "On Hold":
        return "bg-yellow-100 text-yellow-700";
      case "Pending Qualification":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-200 text-gray-700";
    }
  };

  const DetailRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-start py-2 border-b last:border-b-0">
      <Icon size={18} className="text-indigo-500 mr-3 mt-1 flex-shrink-0" />
      <div>
        <span className="font-medium text-gray-600 text-sm">{label}</span>
        <span className="text-gray-900 text-base font-semibold block">
          {value || "N/A"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg transform transition-all duration-300">
        <div className="flex justify-between items-start mb-6 border-b pb-4">
          <h2 className="text-2xl font-bold text-gray-800">{vendor.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="mb-4">
          <span
            className={`px-3 py-1 text-sm rounded-full font-semibold ${getStatusClasses(
              vendor.status
            )}`}
          >
            Status: {vendor.status || "Unknown"}
          </span>
        </div>

        <div className="space-y-4">
          <DetailRow icon={Tag} label="Category" value={vendor.category} />
          <DetailRow icon={Mail} label="Email" value={vendor.email} />
          <DetailRow icon={Phone} label="Phone" value={vendor.contactPhone} />
          <DetailRow icon={User} label="Contact Name" value={vendor.contactName} />
          <DetailRow icon={MapPin} label="Address" value={vendor.address} />
          <DetailRow icon={MapPin} label="Country" value={vendor.country} />
          <DetailRow icon={Clock} label="Created On" value={formatDate(vendor.createdAt)} />
          <DetailRow icon={Clock} label="Last Updated" value={formatDate(vendor.updatedAt)} />
        </div>

        <div className="mt-8 pt-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
