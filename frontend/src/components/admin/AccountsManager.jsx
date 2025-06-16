import React, { useState } from "react";
import CreateUser from "./CreateUser";

const AccountsManager = ({ type, title }) => {
  const [users, setUsers] = useState([
    // Temporary mock data
    {
      id: 1,
      name: "John Doe",
      email: "john@example.com",
      status: "active",
      createdAt: "2024-01-01",
    },
  ]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const handleStatusToggle = (userId) => {
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.id === userId
          ? {
              ...user,
              status: user.status === "active" ? "inactive" : "active",
            }
          : user
      )
    );
  };

  const handleDelete = (userId) => {
    if (
      window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")
    ) {
      setUsers((prevUsers) => prevUsers.filter((user) => user.id !== userId));
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-sna-primary text-white rounded-md hover:bg-sna-primary/90 transition-colors"
        >
          Créer un compte
        </button>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Nom
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Email
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Date de création
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {user.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {user.status === "active" ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="text-sna-primary hover:text-sna-primary/80 mr-3"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleStatusToggle(user.id)}
                      className="text-orange-600 hover:text-orange-800 mr-3"
                    >
                      {user.status === "active" ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(showCreateForm || editingUser) && (
        <CreateUser
          userType={type}
          onClose={() => {
            setShowCreateForm(false);
            setEditingUser(null);
          }}
          onSuccess={(userData) => {
            if (editingUser) {
              setUsers((prevUsers) =>
                prevUsers.map((user) =>
                  user.id === editingUser.id ? { ...user, ...userData } : user
                )
              );
            } else {
              setUsers((prevUsers) => [
                ...prevUsers,
                {
                  ...userData,
                  id: Date.now(),
                  createdAt: new Date().toISOString(),
                  status: "active",
                },
              ]);
            }
            setShowCreateForm(false);
            setEditingUser(null);
          }}
          initialData={editingUser}
        />
      )}
    </div>
  );
};

export default AccountsManager;
