import React, { useState, useEffect } from "react";
import { FaPlusCircle, FaTrashAlt, FaSync } from "react-icons/fa";

// Tailwind-CSS based UI, coherent with existing internal portal styling
const ShopifyShopsManager = () => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchShops = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/customer/all-shops");
      if (!res.ok) throw new Error("Erreur réseau");
      const data = await res.json();
      setShops(data.shops || []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Impossible de charger les boutiques.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  const handleCreate = (shop) => {
    console.log("Créer boutique Shopify pour", shop);
    // TODO: API call
  };

  const handleDelete = (shop) => {
    console.log("Supprimer boutique Shopify pour", shop);
    // TODO: API call
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Création de boutiques Shopify
        </h1>
        <button
          onClick={fetchShops}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
        >
          <FaSync className="mr-2" /> Actualiser
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Pour créer une boutique Shopify, la boutique doit être{" "}
        <span className="font-medium">validée</span>
        et <span className="font-medium">documentée</span> ainsi que le client
        associé.
      </p>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">Chargement...</div>
      ) : (
        <div className="overflow-x-auto bg-white shadow rounded">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700">
                  Boutique
                </th>
                <th className="px-4 py-3 font-medium text-gray-700">Client</th>
                <th className="px-4 py-3 font-medium text-gray-700">Statut</th>
                <th className="px-4 py-3 font-medium text-gray-700 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop, idx) => (
                <tr key={idx} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">{shop.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {shop.clientName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{shop.status}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center space-x-2">
                    <button
                      onClick={() => handleCreate(shop)}
                      className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-white bg-sna-primary rounded hover:bg-blue-600"
                    >
                      <FaPlusCircle className="mr-1" /> Créer la boutique
                      Shopify
                    </button>
                    <button
                      onClick={() => handleDelete(shop)}
                      className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
                    >
                      <FaTrashAlt className="mr-1" /> Supprimer la boutique
                      Shopify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shops.length === 0 && (
            <div className="p-6 text-center text-gray-500">
              Aucune boutique trouvée.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShopifyShopsManager;
