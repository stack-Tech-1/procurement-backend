import { DollarSign, Users, FileText, ClipboardList } from "lucide-react";

const stats = [
  { label: "Total Vendors", value: "126", icon: <Users size={22} />, color: "bg-indigo-500" },
  { label: "Active RFQs", value: "42", icon: <ClipboardList size={22} />, color: "bg-blue-500" },
  { label: "Contracts", value: "18", icon: <FileText size={22} />, color: "bg-teal-500" },
  { label: "Total Spend", value: "$1.2M", icon: <DollarSign size={22} />, color: "bg-amber-500" },
];

export default function DashboardCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-8">
      {stats.map((item) => (
        <div
          key={item.label}
          className="bg-white p-6 rounded-xl shadow hover:shadow-md transition flex items-center gap-4"
        >
          <div className={`${item.color} p-3 rounded-lg text-white`}>{item.icon}</div>
          <div>
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="text-xl font-semibold text-gray-800">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
