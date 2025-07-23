import React from "react";
// import Header from "../Header.jsx"; // No longer needed

const AdminLayout = ({ children }) => {
  // Placeholder icons - replace with actual SVGs or a proper icon library if desired
  const placeholderUserIcon = (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  );
  const placeholderUsersIcon = (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
    />
  );

  const navigation = [
    {
      name: "Comptes Clients",
      href: "/admin/client-accounts",
      icon: placeholderUsersIcon,
    },
    {
      name: "Comptes Internes",
      href: "/admin/internal-accounts",
      icon: placeholderUsersIcon,
    },
    {
      name: "Comptes Admins",
      href: "/admin/admin-accounts",
      icon: placeholderUsersIcon,
    }, // Could use a shield or settings icon too
    { name: "Profil Admin", href: "/admin/profile", icon: placeholderUserIcon },
  ];

  const handleLogout = async () => {
    try {
      // Call the API logout endpoint
      const response = await fetch("/api/logout-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (response.ok) {
        console.log("Admin logout successful");
      } else {
        console.error("Admin logout API call failed");
      }
    } catch (error) {
      console.error("Error during admin logout:", error);
    }

    // Clear local storage and redirect regardless of API result
    localStorage.removeItem("token");
    sessionStorage.clear();
    window.location.href = "/logout-admin";
  };

  const isCurrent = (href) => {
    if (typeof window !== "undefined") {
      return window.location.pathname === href;
    }
    return false;
  };

  return (
    <div className="flex flex-1">
      <div className="hidden md:flex md:flex-col md:w-64 bg-white shadow-sm md:sticky md:top-20 h-auto md:h-[calc(100vh-5rem)] overflow-y-auto z-30">
        <div className="flex flex-col flex-grow pt-5">
          <nav className="flex-1 px-4 pb-4 space-y-2">
            {navigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors 
                  ${
                    isCurrent(item.href)
                      ? "bg-gray-100 text-gray-800" // Active state style
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-800" // Default state style
                  }
                `}
              >
                <svg
                  className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  {item.icon}
                </svg>
                {item.name}
              </a>
            ))}
          </nav>
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <button
              onClick={handleLogout}
              className="flex w-full items-center px-4 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors group"
            >
              <svg
                className="mr-3 h-5 w-5 flex-shrink-0 text-red-400 group-hover:text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      <div className="md:pl-64 flex flex-col flex-1">
        <main className="flex-1 py-8 px-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
