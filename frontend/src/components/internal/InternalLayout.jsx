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
      name: "Creation de compte client",
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
    console.log("Logging out internal user...");

    try {
      // Call the API logout endpoint
      const response = await fetch("/api/logout-internal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        console.log("Internal logout successful");
      } else {
        console.error("Internal logout API call failed");
      }
    } catch (error) {
      console.error("Error during internal logout:", error);
    }

    // Clear any stored tokens or session data
    localStorage.removeItem("token");
    sessionStorage.clear();
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
        <div className="w-64 bg-white shadow-sm relative z-40 flex flex-col">
          <div className="flex flex-col flex-1">
            <div className="flex-1 py-6 px-4">
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
                      })
                    ) : (
                      <svg
                        className="mr-3 h-5 w-5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
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
            <div className="border-t border-gray-200 p-4">
              <button
                onClick={handleLogout}
                className="flex w-full items-center px-4 py-3 text-sm rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                <FaSignOutAlt className="mr-3 h-5 w-5 flex-shrink-0" />
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

export default InternalLayout;
