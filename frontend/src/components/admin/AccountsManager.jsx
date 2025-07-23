import React, { useState, useEffect } from "react";
import CreateUser from "./CreateUser";

const AccountsManager = ({ type, title }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ show: false, user: null });

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, [type]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/accounts/${type}`
          : `http://localhost:5000/api/accounts/${type}`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const transformedUsers = data.users.map((user) => ({
          id: user.username,
          username: user.username,
          name: user.name || "N/A",
          email: user.email,
          status: user.enabled ? "active" : "inactive",
          cognitoStatus: user.status,
          createdAt: user.createdAt
            ? new Date(user.createdAt).toISOString().split("T")[0]
            : "N/A",
          sub: user.sub,
          hasMappedCustomer: user.hasMappedCustomer,
          customerMapping: user.customerMapping,
        }));
        setUsers(transformedUsers);
      } else {
        throw new Error(data.message || "Failed to fetch users");
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusToggle = async (username) => {
    try {
      const user = users.find((u) => u.username === username);
      const newStatus = user.status === "active" ? false : true;

      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/accounts/${type}/${username}/status`
          : `http://localhost:5000/api/accounts/${type}/${username}/status`;

      const response = await fetch(apiUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: newStatus }),
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setUsers((prevUsers) =>
          prevUsers.map((user) =>
            user.username === username
              ? { ...user, status: newStatus ? "active" : "inactive" }
              : user
          )
        );
      } else {
        throw new Error(data.message || "Failed to update user status");
      }
    } catch (error) {
      console.error("Error toggling user status:", error);
      alert("Erreur lors de la modification du statut: " + error.message);
    }
  };

  const handleDeleteClick = (user) => {
    setDeleteModal({ show: true, user });
  };

  const handleDeleteConfirm = async () => {
    const { user } = deleteModal;
    if (!user) return;

    try {
      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/accounts/${type}/${user.username}`
          : `http://localhost:5000/api/accounts/${type}/${user.username}`;

      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setUsers((prevUsers) =>
          prevUsers.filter((u) => u.username !== user.username)
        );
        setDeleteModal({ show: false, user: null });

        // Show success message with details
        if (data.deletedCustomerDocument) {
          console.log(
            "✅ Account and customer profile deleted:",
            data.deletedCustomer
          );
        } else {
          console.log("✅ Account deleted successfully");
        }
      } else {
        throw new Error(data.message || "Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Erreur lors de la suppression: " + error.message);
      setDeleteModal({ show: false, user: null });
    }
  };

  const handleUserCreated = (userData) => {
    // Refresh the users list after successful creation
    fetchUsers();

    // Show credentials if user was created successfully
    if (userData.user) {
      setCredentials({
        name: userData.user.name,
        email: userData.user.email,
        username: userData.user.username,
        status: userData.user.status,
        loginUrl:
          type === "client"
            ? "/client"
            : type === "internal"
              ? "/internal"
              : "/admin",
      });
      setShowCredentials(true);
    }

    setShowCreateForm(false);
    setEditingUser(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sna-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des comptes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Erreur de chargement
            </h3>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <button
              onClick={fetchUsers}
              className="mt-3 bg-red-100 px-3 py-1 rounded text-red-800 hover:bg-red-200"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                {type === "client" && (
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Mapping Client
                  </th>
                )}
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
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={type === "client" ? 6 : 5}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Aucun compte trouvé
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.username}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {user.cognitoStatus}
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
                    {type === "client" && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.hasMappedCustomer ? (
                          <div className="text-sm">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✓ Mappé
                            </span>
                            {user.customerMapping && (
                              <div className="text-xs text-gray-500 mt-1">
                                {user.customerMapping.raisonSociale}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            ⚠ Non mappé
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.createdAt !== "N/A"
                        ? new Date(user.createdAt).toLocaleDateString("fr-FR")
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-sna-primary hover:text-sna-primary/80 mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleStatusToggle(user.username)}
                        className="text-orange-600 hover:text-orange-800 mr-3"
                      >
                        {user.status === "active" ? "Désactiver" : "Activer"}
                      </button>
                      <button
                        onClick={() => handleDeleteClick(user)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))
              )}
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
          onSuccess={handleUserCreated}
          initialData={editingUser}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex flex-col items-center text-center">
              <div className="bg-red-100 p-3 rounded-full">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">
                Supprimer le compte utilisateur
              </h3>
              <div className="mt-2 text-sm text-gray-500">
                <p className="mb-2">
                  Êtes-vous sûr de vouloir supprimer le compte de{" "}
                  <strong className="text-gray-900">
                    {deleteModal.user?.name}
                  </strong>{" "}
                  ?
                </p>
                {type === "client" && deleteModal.user?.hasMappedCustomer && (
                  <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded">
                    <p className="text-xs text-orange-800 font-medium">
                      ⚠️ Ce client a un profil associé qui sera également
                      supprimé définitivement.
                    </p>
                  </div>
                )}
                <p className="text-xs text-red-600">
                  <strong>Attention:</strong> Cette action est irréversible et
                  supprimera définitivement l'accès de cet utilisateur
                  {type === "client" && deleteModal.user?.hasMappedCustomer
                    ? " ainsi que toutes ses données (boutiques, produits, etc.)"
                    : ""}
                  .
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-center space-x-3">
              <button
                onClick={() => setDeleteModal({ show: false, user: null })}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentials && credentials && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Compte créé avec succès
              </h3>
              <button
                onClick={() => setShowCredentials(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-green-50 p-4 rounded-md">
                <p className="text-sm text-green-700">
                  Le compte a été créé avec succès. Voici les informations de
                  connexion :
                </p>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Nom:
                  </label>
                  <p className="text-sm text-gray-900">{credentials.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Email/Username:
                  </label>
                  <p className="text-sm text-gray-900">{credentials.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Status:
                  </label>
                  <p className="text-sm text-gray-900">{credentials.status}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    URL de connexion:
                  </label>
                  <p className="text-sm text-blue-600">
                    {window.location.origin}
                    {credentials.loginUrl}
                  </p>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-md">
                <p className="text-sm text-yellow-700">
                  L'utilisateur devra changer son mot de passe lors de sa
                  première connexion.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowCredentials(false)}
                className="px-4 py-2 bg-sna-primary text-white rounded-md hover:bg-sna-primary/90"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsManager;
