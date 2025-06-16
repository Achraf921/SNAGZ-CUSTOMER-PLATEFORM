import React, { useState } from "react";
import UsersList from "./UsersList";
import CreateUser from "./CreateUser";

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("internal"); // internal, client, admin
  const [showCreateForm, setShowCreateForm] = useState(false);

  const tabs = [
    { id: "internal", label: "Espace Personnel" },
    { id: "client", label: "Espace Client" },
    { id: "admin", label: "Administrateurs" },
  ];

  return (
    <div className="p-6">
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          Gestion des Utilisateurs
        </h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-sna-primary text-white rounded-md hover:bg-sna-primary/90 transition-colors"
        >
          Créer un Compte
        </button>
      </div>

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === tab.id
                      ? "border-sna-primary text-sna-primary"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <UsersList userType={activeTab} />

      {showCreateForm && (
        <CreateUser
          userType={activeTab}
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => {
            setShowCreateForm(false);
            // Refresh users list
          }}
        />
      )}
    </div>
  );
};

export default AdminDashboard;
