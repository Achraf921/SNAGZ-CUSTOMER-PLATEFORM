import React, { useState } from "react";

const Navigation = () => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/internal" },
    { name: "Clients", href: "/internal/clients" },
    { name: "Boutiques", href: "/internal/boutiques" },
    { name: "Configuration Shopify", href: "/internal/configuration-shopify" },
    { name: "Statistiques", href: "/internal/statistiques" },
  ];

  const handleLogout = async () => {
    console.log("🔒 SECURITY: Starting secure navigation logout process...");

    try {
      // Import security utilities
      const { clearAllAuthData } = await import("../../utils/authSecurity");

      // Clear ALL frontend data immediately for security
      clearAllAuthData();

      // Call the API logout endpoint
      const response = await fetch("/api/logout-internal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        console.log("✅ SECURITY: Navigation logout successful");
      } else {
        console.error("⚠️ SECURITY: Navigation logout API call failed");
      }
    } catch (error) {
      console.error("🚨 SECURITY: Error during navigation logout:", error);
    }

    // CRITICAL: Clear ALL browser storage and session data
    localStorage.clear();
    sessionStorage.clear();

    // Clear any cookies that might exist
    document.cookie.split(";").forEach(function (c) {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    console.log("🧹 SECURITY: All navigation user data cleared");

    window.location.href = "/logout-internal";
  };

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <img className="h-8 w-auto" src="/logo.png" alt="Logo" />
            </div>

            {/* Navigation Links */}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={
                    "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  }
                >
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          {/* Profile Dropdown */}
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <div className="relative">
              <button
                type="button"
                className="flex items-center max-w-xs rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              >
                <span className="sr-only">Open user menu</span>
                <div className="h-8 w-8 rounded-full bg-sna-primary/10 flex items-center justify-center">
                  <span className="text-sna-primary font-medium">A</span>
                </div>
                <span className="ml-3 text-gray-700">Admin User</span>
                <svg
                  className={`ml-2 h-5 w-5 text-gray-400 transform transition-transform ${
                    isProfileMenuOpen ? "rotate-180" : ""
                  }`}
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sna-primary"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              <svg
                className="h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isProfileMenuOpen && (
        <div className="sm:hidden">
          <div className="pt-2 pb-3 space-y-1">
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={
                  "block pl-3 pr-4 py-2 border-l-4 text-base font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700"
                }
                onClick={() => setIsProfileMenuOpen(false)}
              >
                {item.name}
              </a>
            ))}
          </div>
          <div className="pt-4 pb-3 border-t border-gray-200">
            <div className="space-y-1">
              <a
                href="/internal/profile"
                className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700"
                onClick={() => setIsProfileMenuOpen(false)}
              >
                Mon profil
              </a>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  handleLogout();
                }}
                className="block w-full text-left pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-red-700 hover:bg-gray-50 hover:border-red-300"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;
