"use client";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { month: "Jan", spend: 80000 },
  { month: "Feb", spend: 60000 },
  { month: "Mar", spend: 120000 },
  { month: "Apr", spend: 90000 },
  { month: "May", spend: 140000 },
  { month: "Jun", spend: 110000 },
];

export default function Charts() {
  return (
    <div className="bg-white p-6 rounded-xl shadow mt-8">
      <h2 className="text-lg font-semibold text-gray-700 mb-4">
        Monthly Procurement Spend
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="month" stroke="#888" />
          <Tooltip />
          <Bar dataKey="spend" fill="#6366f1" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
