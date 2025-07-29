import React, { useState, useEffect } from "react";
// Removed: import { Link } from "react-router-dom";
import ClientForm from "./ClientForm";
import ClientShopsDisplay from "./ClientShopsDisplay"; // Import ClientShopsDisplay

const ClientsList = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientIdForShops, setSelectedClientIdForShops] =
    useState(null);
  const [shopsOfSelectedClient, setShopsOfSelectedClient] = useState([]);
  const [isLoadingShops, setIsLoadingShops] = useState(false);
  const [errorLoadingShops, setErrorLoadingShops] = useState(null);

  useEffect(() => {
    // Fetch clients data from backend
    const fetchClients = async () => {
      try {
        const response = await fetch(
          `/api/internal/all?details=true&_=${new Date().getTime()}`,
          { headers: { "Cache-Control": "no-cache" } }
        );
        if (!response.ok)
          throw new Error("Erreur lors du chargement des clients");
        const data = await response.json();
        // Expecting data.customers to be an array
        setClients(
          (data.customers || []).map((c) => {
            // Use the customer's own status field, defaulting to 'inactive' if not present.
            const status = c.status || "inactive";

            return {
              id: c._id || c.id,
              name: c.raisonSociale || c.name || "-",
              email: c.email || "-",
              shopsCount: Array.isArray(c.shops)
                ? c.shops.length
                : c.shopsCount || 0,
              status: status,
            };
          })
        );
      } catch (err) {
        setError(err.message);
      }
      setIsLoading(false);
    };

    fetchClients();
  }, []);

  const handleManageShops = async (clientId) => {
    if (selectedClientIdForShops === clientId) {
      // If already selected, toggle off or simply do nothing/re-fetch
      setSelectedClientIdForShops(null); // Simple toggle off
      setShopsOfSelectedClient([]);
      return;
    }

    setSelectedClientIdForShops(clientId);
    setIsLoadingShops(true);
    setErrorLoadingShops(null);
    setShopsOfSelectedClient([]); // Clear previous shops

    try {
      const apiUrl = `http://localhost:3000/api/internal/clients/${clientId}`;
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText ||
            `Erreur lors de la récupération des boutiques du client (${response.status})`
        );
      }
      const data = await response.json();
      if (!data.success || !data.customer) {
        throw new Error("Données du client non valides ou manquantes.");
      }
      // If shops array is missing or not an array (e.g. for a client with 0 shops), default to an empty array.
      const shopsData = Array.isArray(data.customer.shops)
        ? data.customer.shops
        : [];
      setShopsOfSelectedClient(shopsData);
    } catch (err) {
      setErrorLoadingShops(
        `Erreur: ${
          err.message || "Impossible de charger les boutiques du client"
        }`
      );
      setShopsOfSelectedClient([]); // Ensure shops are cleared on error
    } finally {
      setIsLoadingShops(false);
    }
  };

  const handleShopDeletedInList = (
    deletedShopId,
    updatedClientDataWithShops
  ) => {
    let newShopsCount = 0;
    if (
      updatedClientDataWithShops &&
      Array.isArray(updatedClientDataWithShops.shops)
    ) {
      setShopsOfSelectedClient(updatedClientDataWithShops.shops);
      newShopsCount = updatedClientDataWithShops.shops.length;
    } else {
      // Fallback if the structure is different or shops are missing - this part might be tricky if updatedClientDataWithShops is not reliable
      let updatedShopsArray = [];
      setShopsOfSelectedClient((prevShops) => {
        updatedShopsArray = prevShops.filter(
          (shop) => String(shop.shopId || shop._id) !== String(deletedShopId)
        );
        return updatedShopsArray;
      });
      newShopsCount = updatedShopsArray.length; // This might be slightly off if prevShops wasn't perfectly in sync, but better than nothing
    }

    // Update the shopsCount in the main clients list
    setClients((prevClients) =>
      prevClients.map((c) =>
        c.id === selectedClientIdForShops
          ? { ...c, shopsCount: newShopsCount }
          : c
      )
    );
  };

  const handleShopUpdatedInList = async (updatedShopResponse) => {
    if (updatedShopResponse && updatedShopResponse.success) {
      try {
        // Fetch fresh data for the client's shops
        const response = await fetch(
          `http://localhost:3000/api/internal/clients/${selectedClientIdForShops}?_=${new Date().getTime()}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            credentials: "include",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to refresh shop data");
        }

        const data = await response.json();
        if (!data.success || !data.customer) {
          throw new Error("Invalid client data received");
        }

        // Update the shops list with fresh data
        const shopsData = Array.isArray(data.customer.shops)
          ? data.customer.shops
          : [];
        setShopsOfSelectedClient(shopsData);

        // Update the shopsCount in the main clients list
        setClients((prevClients) =>
          prevClients.map((c) =>
            c.id === selectedClientIdForShops
              ? { ...c, shopsCount: shopsData.length }
              : c
          )
        );
      } catch (error) {
        console.error("Error refreshing shop data:", error);
        setErrorLoadingShops(`Error refreshing data: ${error.message}`);
      }
    } else {
      console.error(
        "Failed to update shop in list due to invalid response:",
        updatedShopResponse
      );
    }
  };

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <p>Chargement des clients...</p>;
  if (error) return <p>Erreur: {error}</p>;

  return (
    <div className="w-full p-4">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Liste des Clients</h1>
        <input
          type="text"
          placeholder="Rechercher un client..."
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredClients.length === 0 ? (
        <p>Aucun client trouvé.</p>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
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
                  Boutiques
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Statut
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredClients.map((client) => (
                <React.Fragment key={client.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {client.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {client.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {client.shopsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          client.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {client.status === "active" ? "Validé" : "En attente"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleManageShops(client.id)}
                        className="text-indigo-600 hover:text-indigo-900 font-medium mr-4"
                      >
                        {selectedClientIdForShops === client.id
                          ? "Fermer boutiques"
                          : "Gérer les boutiques"}
                      </button>
                      <a
                        href={`/internal/clients/${client.id}`}
                        className="text-sna-primary hover:text-sna-primary/90"
                      >
                        Voir les détails
                      </a>
                    </td>
                  </tr>
                  {selectedClientIdForShops === client.id && (
                    <tr className="bg-gray-100">
                      <td colSpan="5" className="p-4">
                        {isLoadingShops && <p>Chargement des boutiques...</p>}
                        {errorLoadingShops && (
                          <p className="text-red-500">{errorLoadingShops}</p>
                        )}
                        {!isLoadingShops &&
                          !errorLoadingShops &&
                          (shopsOfSelectedClient.length > 0 ? (
                            <ClientShopsDisplay
                              shops={shopsOfSelectedClient}
                              clientId={selectedClientIdForShops}
                              onShopDeleted={handleShopDeletedInList}
                              onShopUpdated={handleShopUpdatedInList}
                            />
                          ) : (
                            <p>Ce client n'a pas de boutiques enregistrées.</p>
                          ))}
                        <button
                          onClick={() => setSelectedClientIdForShops(null)}
                          className="mt-2 text-sm text-gray-600 hover:text-gray-800 py-1 px-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                        >
                          Fermer
                        </button>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm && <ClientForm onClose={() => setShowAddForm(false)} />}
    </div>
  );
};

export default ClientsList;
