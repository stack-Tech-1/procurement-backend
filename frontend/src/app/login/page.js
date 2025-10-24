"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:4000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Invalid credentials");

      // Save token & user
      localStorage.setItem("authToken", data.token); // Ensure the token is stored with the correct key
      localStorage.setItem("user", JSON.stringify(data.user));

      //Redirect based on role Id
      if (data.user.roleId === 1) 
        router.push("/dashboard");
      else if (data.user.roleId === 3) 
        router.push("/vendor-dashboard");
      else if (data.user.roleId === 2)
        router.push("dashboard");
      else 
        router.push("/");


    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Sign in to your procurement dashboard"
      background={
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          {/* Animated Background Elements */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Floating orbs */}
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-float-slow"></div>
            <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-float-medium"></div>
            <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-float-slow"></div>
            
            {/* Grid pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,black,transparent)]"></div>
            
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 animate-shimmer"></div>
          </div>
        </div>
      }
    >
      {/* Enhanced Error Message - More Visible */}
      {error && (
        <div 
          className={`bg-gradient-to-r from-red-500/40 to-orange-500/40 text-white text-sm p-4 rounded-2xl mb-6 text-center border border-red-300/50 backdrop-blur-sm transform transition-all duration-500 shadow-lg ${
            mounted ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'
          }`}
        >
          <div className="flex items-center justify-center gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center animate-pulse shadow-md">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <span className="font-semibold text-white drop-shadow-sm">{error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Input with Enhanced Visibility */}
        <div 
          className={`space-y-2 transform transition-all duration-700 delay-100 ${
            mounted ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
          }`}
        >
          <label className="block text-sm font-bold text-white mb-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full animate-pulse shadow-sm"></div>
            Email Address
          </label>
          <div className="relative group">
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              className="w-full p-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-400/50 focus:border-blue-400 transition-all duration-300 text-white placeholder-white/70 shadow-lg hover:shadow-blue-500/20 group-hover:border-blue-400/50 font-medium"
              required
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-4">
              <svg className="w-6 h-6 text-blue-300 group-focus-within:text-blue-200 group-hover:text-blue-200 transition-all duration-300 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Password Input with Enhanced Visibility */}
        <div 
          className={`space-y-2 transform transition-all duration-700 delay-200 ${
            mounted ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
          }`}
        >
          <label className="block text-sm font-bold text-white mb-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full animate-pulse shadow-sm"></div>
            Password
          </label>
          <div className="relative group">
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              className="w-full p-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-400/50 focus:border-purple-400 transition-all duration-300 text-white placeholder-white/70 shadow-lg hover:shadow-purple-500/20 group-hover:border-purple-400/50 font-medium"
              required
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-4">
              <svg className="w-6 h-6 text-purple-300 group-focus-within:text-purple-200 group-hover:text-purple-200 transition-all duration-300 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Enhanced Submit Button */}
        <div 
          className={`transform transition-all duration-700 delay-300 ${
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
        >
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 text-white py-4 rounded-2xl hover:from-blue-500 hover:via-purple-500 hover:to-indigo-500 transition-all duration-500 font-bold text-lg shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 disabled:opacity-50 disabled:transform-none disabled:hover:shadow-2xl group relative overflow-hidden border border-white/30"
          >
            {/* Animated background shine */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
            
            {/* Loading State */}
            {loading ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin shadow-sm" />
                <span className="animate-pulse font-semibold">Signing In...</span>
              </div>
            ) : (
              <span className="relative flex items-center justify-center gap-2 font-bold">
                Access Dashboard
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-300 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            )}
          </button>
        </div>
      </form>

      {/* Enhanced Footer Links */}
      <div 
        className={`flex justify-between text-sm mt-8 transform transition-all duration-700 delay-400 ${
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}
      >
        <a 
          href="/forgot-password" 
          className="text-white/90 hover:text-blue-300 font-semibold transition-all duration-300 inline-flex items-center gap-2 group hover:underline underline-offset-4 hover:scale-105"
        >
          <svg className="w-5 h-5 group-hover:scale-110 transition-transform duration-300 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Forgot Password?
        </a>
        
        <a 
          href="/signup" 
          className="text-white/90 hover:text-purple-300 font-semibold transition-all duration-300 inline-flex items-center gap-2 group hover:underline underline-offset-4 hover:scale-105"
        >
          Create Account
          <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
      </div>
      
      {/* Enhanced Decorative Animated Elements */}
      <div className="absolute top-6 right-6 w-20 h-20 bg-blue-400/30 rounded-full animate-bounce delay-1000 backdrop-blur-sm shadow-lg"></div>
      <div className="absolute bottom-6 left-6 w-16 h-16 bg-purple-400/30 rounded-full animate-pulse delay-1500 backdrop-blur-sm shadow-lg"></div>
      <div className="absolute top-1/4 left-8 w-10 h-10 bg-cyan-400/30 rounded-full animate-ping delay-2000 shadow-lg"></div>
    </AuthLayout>
  );
}