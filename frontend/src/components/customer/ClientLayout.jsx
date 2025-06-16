import React from "react";
// import Header from "../Header.jsx"; // No longer needed here

const ClientLayout = ({ children }) => {


  const navigation = [
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

  const handleLogout = () => {
    // Placeholder for logout logic
    console.log("Logging out...");
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
                className="w-full text-left px-4 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
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
