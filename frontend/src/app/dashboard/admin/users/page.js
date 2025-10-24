"use client";
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Users, Loader2, CheckCircle, XCircle, User, Mail, ToggleRight
} from 'lucide-react';
import { toast } from 'react-hot-toast'; 

// Components for Layout
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

const API_BASE_URL = 'http://localhost:4000/api/users';

// --- Separate Component for Content (Table/Loading/Error UI) ---
const UserManagementContent = ({ users, loading, error, fetchUsers, handleToggleStatus }) => {
    
    // NOTE: This loading state is for the *initial* load only. 
    // The main loading and error checks should be done in the main Page component 
    // to include the layout components.

    // --- Main Table Render ---
    return (
        // flex-1 allows this section to fill the space below the Topbar, overflow-y-auto makes it scrollable
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-50">
            {/* Conditional Render: Loading state (if data is being fetched) */}
            {loading && users.length === 0 && (
                <div className="flex justify-center items-center h-full min-h-[50vh]">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <p className="ml-3 text-lg text-gray-600">Loading user list...</p>
                </div>
            )}
            
            {/* Conditional Render: Error state (if data fetch failed and no data exists) */}
            {error && !users.length && (
                <div className="p-8 text-center h-full min-h-[50vh]">
                    <h1 className="text-3xl font-bold text-red-600 mb-4">Error</h1>
                    <p className="text-gray-600">{error}</p>
                    <button onClick={fetchUsers} className="mt-4 text-blue-600 hover:underline">Try Again</button>
                </div>
            )}
            
            {/* Main Content: Displayed once data is loaded or if loading/error checks above don't apply */}
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                        <Users className="w-7 h-7 mr-3 text-blue-600" />
                        System User Management ({users.length})
                    </h1>
                    <button 
                        onClick={fetchUsers} 
                        className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition"
                        disabled={loading}
                    >
                        <Loader2 className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                        Refresh List
                    </button>
                </div>

                <div className="bg-white shadow-xl rounded-xl overflow-hidden border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {users.map((user) => (
                                <tr key={user.id} className="hover:bg-blue-50/50 transition duration-150">
                                    {/* User Details */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <User className="w-5 h-5 mr-3 text-gray-500" />
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{user.name || 'N/A'}</div>
                                                <div className="text-sm text-gray-500 flex items-center">
                                                    <Mail className="w-3 h-3 mr-1" />
                                                    {user.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    {/* Role */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            user.roleId === 1 ? 'bg-indigo-100 text-indigo-800' :
                                            user.roleId === 2 ? 'bg-green-100 text-green-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {user.role?.name || 'Unknown'}
                                        </span>
                                    </td>
                                    
                                    {/* Status */}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            <div className="flex items-center gap-1">
                                                {user.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </div>
                                        </span>
                                    </td>
                                    
                                    {/* Created At */}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </td>

                                    {/* Action Button */}
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                        <button
                                            onClick={() => handleToggleStatus(user.id, user.isActive)}
                                            disabled={user.isUpdating || user.roleId === 1} // Prevent deactivating the primary admin (roleId=1)
                                            className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-xs font-medium text-white transition duration-150 ${
                                                user.isUpdating 
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : user.roleId === 1 
                                                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                                        : user.isActive 
                                                            ? 'bg-red-600 hover:bg-red-700' 
                                                            : 'bg-green-600 hover:bg-green-700'
                                            }`}
                                        >
                                            {user.isUpdating ? (
                                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                            ) : (
                                                <ToggleRight className="w-4 h-4 mr-1" />
                                            )}
                                            {user.isUpdating 
                                                ? 'Processing...' 
                                                : user.roleId === 1
                                                    ? 'System Admin'
                                                    : user.isActive ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!users.length && !loading && !error && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500 text-lg">
                                        No users found in the system.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
};

// --- Main Page Component ---
const UserManagementPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // --- Data Fetching Logic (Your existing logic) ---
    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error("Authentication token missing.");

            const response = await axios.get(API_BASE_URL, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setUsers(response.data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        } catch (err) {
            console.error("Failed to fetch users:", err);
            setError(err.response?.data?.error || err.message || 'Could not load user data.');
            toast.error(err.response?.data?.error || 'Failed to load users.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);
    
    // --- Status Toggle Logic (Your existing logic) ---
    const handleToggleStatus = async (userId, currentStatus) => {
        const newStatus = !currentStatus;
        const action = newStatus ? 'Activate' : 'Deactivate';
        
        if (!window.confirm(`Are you sure you want to ${action} this user?`)) {
            return;
        }

        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) return;

        // Optimistic UI Update: Temporarily update the status locally
        const updatedUsers = [...users];
        updatedUsers[userIndex] = { ...updatedUsers[userIndex], isUpdating: true };
        setUsers(updatedUsers);

        try {
            const token = localStorage.getItem('authToken');
            if (!token) throw new Error("Authentication token missing.");

            // API Call: PATCH /api/users/:id/status
            await axios.patch(`${API_BASE_URL}/${userId}/status`, 
                { isActive: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Final UI Update: Fetch the fresh data to ensure consistency
            toast.success(`User successfully ${newStatus ? 'activated' : 'deactivated'}.`);
            await fetchUsers();

        } catch (err) {
            // Revert UI Update on failure
            updatedUsers[userIndex] = { ...updatedUsers[userIndex], isUpdating: false };
            setUsers(updatedUsers);
            
            console.error("Failed to toggle status:", err);
            toast.error(err.response?.data?.error || `Failed to ${action} user.`);
        }
    };
    
    // --- MAIN LAYOUT RENDER ---
    return (
        // 1. Outer container: Full height, flex in a row (for sidebar + content)
        <div className="flex h-screen bg-gray-100"> 
            
            {/* 2. Sidebar Component */}
            <Sidebar /> 

            {/* 3. Main Content Wrapper: Takes remaining width, flex in a column (for topbar + main) */}
            <div className="flex flex-col flex-1 overflow-hidden"> 
                
                {/* 4. Topbar Component */}
                <Topbar /> 

                {/* 5. The actual Page Content */}
                <UserManagementContent 
                    users={users} 
                    loading={loading} 
                    error={error} 
                    fetchUsers={fetchUsers} 
                    handleToggleStatus={handleToggleStatus} 
                />
                
            </div>
        </div>
    );
};

export default UserManagementPage;