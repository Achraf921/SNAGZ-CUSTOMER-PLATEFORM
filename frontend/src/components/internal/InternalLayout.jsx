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

  const handleLogout = () => {
    console.log("Logging out internal user...");
    // Clear any stored tokens or session data
    localStorage.removeItem("token");
    sessionStorage.clear();
    // Redirect directly to internal login page
    window.location.href = "/internal-login";
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
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-50`}
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
                className="flex w-full items-center px-4 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg
                  className="mr-3 h-5 w-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
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
