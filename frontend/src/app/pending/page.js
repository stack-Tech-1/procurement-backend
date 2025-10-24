"use client";
import { useRouter } from "next/navigation";

export default function PendingApprovalPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center">
      <div className="bg-white shadow-md rounded-lg p-10 max-w-md">
        <h1 className="text-2xl font-semibold text-gray-800 mb-4">
          Awaiting Admin Approval
        </h1>
        <p className="text-gray-600 mb-6">
          Your account is currently pending approval by an administrator.  
          You’ll be notified once your access is activated.
        </p>

        <button
          onClick={() => {
            localStorage.clear();
            router.push("/login");
          }}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
