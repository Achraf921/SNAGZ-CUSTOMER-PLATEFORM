import React from "react";
import {
  FaShopify,
  FaRegFileAlt,
  FaUsers,
  FaStore,
  FaCube,
  FaClipboardCheck,
  FaCheckCircle,
  FaCheck,
  FaBook,
  FaUserPlus,
  FaChartBar,
  FaUser,
  FaFileExport,
  FaSignOutAlt, // Import the sign-out icon
} from "react-icons/fa";
// import Header from "../Header.jsx"; // No longer needed

const InternalLayout = ({ children }) => {
  const navigation = [
    {
      name: "Clients",
      href: "/internal/clients",
      icon: <FaUsers />,
    },
    {
      name: "Boutiques",
      href: "/internal/boutiques",
      icon: <FaStore />,
    },
    {
      name: "Produits",
      href: "/internal/produits",
      icon: <FaCube />,
    },
    {
      name: "Clients à valider",
      href: "/internal/clients-a-valider",
      icon: <FaClipboardCheck />,
    },
    {
      name: "Boutiques à valider",
      href: "/internal/boutiques-a-valider",
      icon: <FaCheckCircle />,
    },
    {
      name: "Produits à valider",
      href: "/internal/produits-a-valider",
      icon: <FaCheck />,
    },
    {
      name: "Documentation",
      href: "/internal/documentation",
      icon: <FaBook />,
    },
    {
      name: "Configuration Shopify",
      href: "/internal/configuration-shopify",
      icon: <FaShopify />,
    },
    {
      name: "Fiche produits Shopify",
      href: "/internal/fiche-produits-shopify",
      icon: <FaRegFileAlt />,
    },
    {
      name: "Génération d'EC",
      href: "/internal/generation-ec",
      icon: <FaFileExport />,
    },
    {
      name: "Gestion de compte client",
      href: "/internal/creation-comptes-client",
      icon: <FaUserPlus />,
    },
    {
      name: "Statistiques",
      href: "/internal/statistiques",
      icon: <FaChartBar />,
    },
    {
      name: "Mon profil",
      href: "/internal/profile",
      icon: <FaUser />,
    },
  ];

  const handleLogout = async () => {
    console.log("🔒 SECURITY: Starting secure internal logout process...");

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
        console.log("✅ SECURITY: Internal logout successful");
      } else {
        console.error("⚠️ SECURITY: Internal logout API call failed");
      }
    } catch (error) {
      console.error("🚨 SECURITY: Error during internal logout:", error);
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

    console.log("🧹 SECURITY: All internal user data cleared");

    // Call the proper backend logout route
    window.location.href = "/logout-internal";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* <div className="relative z-50">
        <Header />
      </div> */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-sm relative z-40 flex flex-col h-screen">
          <div className="flex flex-col flex-1">
            <div className="flex-1 py-6 px-4 overflow-y-auto">
              <nav className="space-y-2">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`flex items-center px-4 py-3 text-sm rounded-lg transition-colors text-gray-600 hover:bg-gray-50`}
                  >
                    {React.isValidElement(item.icon) ? (
                      React.cloneElement(item.icon, {
                        className: "mr-3 h-5 w-5 flex-shrink-0",
                        style: { fontWeight: "normal" },
                      })
                    ) : (
                      <svg
                        className="mr-3 h-5 w-5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        style={{ fontWeight: "normal" }}
                      >
                        {item.icon}
                      </svg>
                    )}
                    {item.name}
                  </a>
                ))}
              </nav>
            </div>

            {/* Logout button */}
            <div className="border-t border-gray-200 p-4 flex-shrink-0">
              <button
                onClick={handleLogout}
                className="flex w-full items-center px-4 py-3 text-sm rounded-lg text-red-600 hover:bg-red-50 transition-colors"
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
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default InternalLayout;
