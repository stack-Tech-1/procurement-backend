// src/app/dashboard/procurement/vendors/page.jsx (or similar path)

"use client";
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Sliders, ChevronDown, CheckCircle, Clock, XCircle, ArrowUp, ArrowDown } from 'lucide-react';
// Assuming these paths are correct for your Next.js project
import Sidebar from '@/components/Sidebar'; 
import Topbar from '@/components/Topbar'; 

const API_BASE_URL = 'http://localhost:4000/api/vendor'; // Your backend URL

// MOCK DATA for Filter Options (Match your backend enums/data)
const STATUS_OPTIONS = ['NEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_RENEWAL'];
const TYPE_OPTIONS = ['GeneralContractor', 'SubContractor', 'Supplier'];

const VendorListPage = () => {
    // --- STATE & DATA FETCHING LOGIC (Same as before) ---
    const [vendors, setVendors] = useState([]);
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });
    const [filters, setFilters] = useState({ search: '', status: '', type: '', sortField: 'updatedAt', sortOrder: 'desc' });

    const fetchVendors = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('authToken'); 
            if (!token) {
                console.warn("Authentication token missing. Skipping data fetch.");
                return;
            }

            const params = {
                page: pagination.page,
                pageSize: pagination.pageSize,
                search: filters.search,
                status: filters.status,
                type: filters.type,
                sortField: filters.sortField,
                sortOrder: filters.sortOrder
            };

            const listResponse = await axios.get(`${API_BASE_URL}/list`, {
                params,
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const summaryResponse = await axios.get(`${API_BASE_URL}/analytics/summary`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setVendors(listResponse.data.data);
            setPagination(prev => ({ ...prev, total: listResponse.data.total, totalPages: listResponse.data.totalPages }));
            setSummary(summaryResponse.data);

        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.pageSize, filters]);

    useEffect(() => {
        fetchVendors();
    }, [fetchVendors]);


    // --- RENDERING HELPERS (Same as before) ---
    const getStatusIcon = (status) => {
        const iconClasses = "w-4 h-4 mr-2";
        switch (status) {
            case 'APPROVED': return <CheckCircle className={`${iconClasses} text-green-500`} />;
            case 'REJECTED': return <XCircle className={`${iconClasses} text-red-500`} />;
            case 'NEEDS_RENEWAL': return <XCircle className={`${iconClasses} text-orange-500`} />;
            case 'UNDER_REVIEW': 
            case 'NEW':
            default: return <Clock className={`${iconClasses} text-blue-500`} />;
        }
    };

    const handleSort = (field) => {
        setFilters(prev => ({
            ...prev,
            sortField: field,
            sortOrder: prev.sortField === field && prev.sortOrder === 'desc' ? 'asc' : 'desc'
        }));
        setPagination(prev => ({ ...prev, page: 1 })); 
    };

    const renderSortArrow = (field) => {
        if (filters.sortField !== field) return null;
        return filters.sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, page: 1 }));
    };
    
    
    // --- MAIN DASHBOARD CONTENT (Extracted for clarity) ---
    const DashboardContent = (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Vendor Qualification Dashboard</h1>
            
            {/* KPI Summary Block */}
            <div className="grid grid-cols-5 gap-4 mb-8">
                {/* ... (KPI rendering logic remains here) ... */}
                {['Total Vendors', 'Approved', 'Under Review', 'Expired', 'Expiring Soon'].map((label, index) => (
                    <div key={index} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
                        <p className="text-sm font-medium text-gray-500">{label}</p>
                        <p className="text-2xl font-semibold text-gray-900 mt-1">
                            {label === 'Total Vendors' ? summary.totalVendors : 
                             label === 'Approved' ? summary.statusBreakdown?.APPROVED :
                             label === 'Under Review' ? (summary.statusBreakdown?.UNDER_REVIEW || 0) + (summary.statusBreakdown?.NEW || 0) :
                             label === 'Expired' ? summary.expiredVendorsCount :
                             label === 'Expiring Soon' ? summary.expiringSoonVendorsCount : 0
                            }
                        </p>
                    </div>
                ))}
            </div>

            {/* Filter and Search Bar (Remains here) */}
            <div className="bg-white p-4 rounded-lg shadow-md mb-6 flex items-center space-x-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by Name, CR, or Email..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        value={filters.search}
                        onChange={(e) => handleFilterChange('search', e.target.value)}
                    />
                </div>

                {/* Status Filter */}
                <select
                    className="p-2 border border-gray-300 rounded-lg"
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                    <option value="">All Statuses</option>
                    {STATUS_OPTIONS.map(status => (
                        <option key={status} value={status}>{status.replace('_', ' ')}</option>
                    ))}
                </select>

                {/* Type Filter */}
                <select
                    className="p-2 border border-gray-300 rounded-lg"
                    value={filters.type}
                    onChange={(e) => handleFilterChange('type', e.target.value)}
                >
                    <option value="">All Types</option>
                    {TYPE_OPTIONS.map(type => (
                        <option key={type} value={type}>{type.replace(/([A-Z])/g, ' $1').trim()}</option>
                    ))}
                </select>

                <button 
                    className="text-gray-500 hover:text-gray-700 p-2"
                    onClick={() => setFilters({ search: '', status: '', type: '', sortField: 'updatedAt', sortOrder: 'desc' })}
                >
                    <Sliders className="w-5 h-5" />
                </button>
            </div>

            {/* Vendor List Table (Remains here) */}
            <div className="bg-white rounded-lg shadow-xl overflow-x-auto">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading vendors...</div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        {/* ... (Table headers and body rendering logic remains here) ... */}
                        <thead className="bg-gray-50">
                            <tr>
                                {['Vendor ID', 'Name', 'Type', 'Status', 'Updated', 'CR Expiry', 'ISO Expiry', 'Zakat Expiry'].map((header, index) => {
                                    const field = ['vendorId', 'name', 'vendorType', 'status', 'updatedAt', 'crExpiry', 'isoExpiry', 'zakatExpiry'][index];
                                    return (
                                        <th
                                            key={field}
                                            scope="col"
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            onClick={() => handleSort(field)}
                                        >
                                            <div className="flex items-center">
                                                {header}
                                                {renderSortArrow(field)}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {vendors.length === 0 ? (
                                <tr><td colSpan="10" className="px-6 py-4 text-center text-gray-500">No vendors match your criteria.</td></tr>
                            ) : (
                                vendors.map((vendor) => (
                                    <tr key={vendor.id} className="hover:bg-blue-50/50 transition duration-150">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{vendor.vendorId}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vendor.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vendor.vendorType}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium ${vendor.status === 'APPROVED' ? 'bg-green-100 text-green-800' : vendor.status === 'REJECTED' || vendor.status === 'NEEDS_RENEWAL' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                {getStatusIcon(vendor.status)}
                                                {vendor.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(vendor.updatedAt).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vendor.crExpiry ? new Date(vendor.crExpiry).toLocaleDateString() : 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vendor.isoExpiry ? new Date(vendor.isoExpiry).toLocaleDateString() : 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vendor.zakatExpiry ? new Date(vendor.zakatExpiry).toLocaleDateString() : 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <a href={`/dashboard/procurement/vendors/${vendor.id}`} className="text-blue-600 hover:text-blue-900 font-semibold transition duration-150">
                                                Review
                                            </a>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination (Basic) */}
            <div className="flex justify-between items-center mt-6">
                <p className="text-sm text-gray-600">
                    Showing {Math.min(pagination.total, (pagination.page - 1) * pagination.pageSize + 1)} to {Math.min(pagination.total, pagination.page * pagination.pageSize)} of {pagination.total} entries
                </p>
                <div className="flex space-x-2">
                    <button 
                        className="px-4 py-2 border rounded-lg bg-white hover:bg-gray-100 disabled:opacity-50"
                        disabled={pagination.page <= 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                        Previous
                    </button>
                    <button 
                        className="px-4 py-2 border rounded-lg bg-white hover:bg-gray-100 disabled:opacity-50"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
    
    // --- MAIN RENDER WRAPPER ---
    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* 1. Sidebar on the Left */}
            <Sidebar />

            {/* 2. Main Content Area (Topbar + Content) */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Topbar spans the width of the content area */}
                <Topbar />
                
                {/* Scrollable Main Content */}
                <main className="flex-1 overflow-y-auto">
                    {DashboardContent}
                </main>
            </div>
        </div>
    );
};

export default VendorListPage;