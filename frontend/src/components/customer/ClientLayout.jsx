import React from "react";
import { FaSignOutAlt } from "react-icons/fa"; // Import the sign-out icon
// import Header from "../Header.jsx"; // No longer needed here

const ClientLayout = ({ children }) => {
  const navigation = [
    {
      name: "Dashboard",
      href: "/client/dashboard",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      ),
    },
    {
      name: "Créer une boutique",
      href: "/client/boutiques/create",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
        />
      ),
    },
    {
      name: "Créer un produit",
      href: "/client/produits/create",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      ),
    },
    {
      name: "Mes boutiques",
      href: "/client/boutiques",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
        />
      ),
    },
    {
      name: "Mes produits",
      href: "/client/produits",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
        />
      ),
    },
    {
      name: "Mon compte",
      href: "/client/compte",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      ),
    },
  ];

  const handleLogout = async () => {
    console.log("🔒 SECURITY: Starting secure logout process...");

    try {
      // Import security utilities
      const { clearAllAuthData } = await import("../../utils/authSecurity");

      // Clear ALL frontend data immediately for security
      clearAllAuthData();

      // Call the API logout endpoint
      const response = await fetch("/api/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        console.log("✅ SECURITY: Logout successful");
      } else {
        console.error("⚠️ SECURITY: Logout API call failed");
      }
    } catch (error) {
      console.error("🚨 SECURITY: Error during logout:", error);
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

    console.log("🧹 SECURITY: All user data cleared");

    // Force redirect to logout endpoint
    window.location.href = "/logout";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* <div className="sticky top-0 z-50">
        <Header />
      </div> */}
      <div className="flex flex-col md:flex-row min-h-[calc(100vh-0px)]">
        {" "}
        {/* Adjusted min-height if header was 64px */}
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-white shadow-md">
          <div className="h-full flex flex-col justify-between">
            <nav className="flex-1 px-4 py-4 space-y-1">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-100`}
                >
                  <svg
                    className="mr-3 h-5 w-5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {item.icon}
                  </svg>
                  {item.name}
                </a>
              ))}
            </nav>
            {/* Logout button */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="flex w-full items-center px-4 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                <FaSignOutAlt
                  className="mr-3 h-5 w-5 flex-shrink-0"
                  style={{ fontWeight: "normal" }}
                />
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
        {/* Main content */}
        <main className="flex-1 py-8 px-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default ClientLayout;
