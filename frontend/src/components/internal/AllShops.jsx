import React, { useState, useEffect } from "react";
import ShopDetails from './ShopDetails'; // Assuming ShopDetails is in the same directory

const AllShops = () => {
  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState({});

  useEffect(() => {
    // Fetch all shops data from backend
    const fetchAllShops = async () => {
      try {
        const response = await fetch("/api/customer/all-shops");
        if (!response.ok)
          throw new Error("Erreur lors du chargement des boutiques");
        const data = await response.json();
        // Expecting data.shops to be an array of shops with client info
        setShops(
          (data.shops || []).map((shop) => ({
            id: shop.shopId,
            name: shop.nomProjet || shop.name || "-",
            clientName: shop.clientName,
            clientId: shop.clientId,
            productsCount: shop.productsCount,
            status: shop.status,
          }))
        );
      } catch (err) {
        setError(err.message);
      }
      setIsLoading(false);
    };
    fetchAllShops();
  }, []);

  const filteredShops = shops.filter(
    (shop) =>
      shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shop.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleRow = (shopId) => {
    setExpandedRows(prev => ({
      ...prev,
      [shopId]: !prev[shopId]
    }));
  };

  if (isLoading) return <p>Chargement de toutes les boutiques...</p>;
  if (error) return <p>Erreur: {error}</p>;

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          Toutes les Boutiques
        </h1>
        <input
          type="text"
          placeholder="Rechercher une boutique ou un client..."
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredShops.length === 0 ? (
        <p>Aucune boutique trouvée.</p>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Nom Boutique
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Nom Client
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Produits
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
              {filteredShops.map((shop) => (
                <React.Fragment key={shop.id}>
                  <tr
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {shop.name || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shop.clientName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shop.productsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${shop.status === 'valid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}
                      >
                        {shop.status === 'valid' ? 'Validée' : 'En attente'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => toggleRow(shop.id)}
                        className="text-sna-primary hover:underline"
                      >
                        {expandedRows[shop.id] ? 'Masquer' : 'Voir Détails'}
                      </button>
                    </td>
                  </tr>
                  {expandedRows[shop.id] && (
                    <tr>
                      <td colSpan="5" className="px-6 py-4 bg-gray-50">
                        <ShopDetails 
                          clientId={shop.clientId}
                          shopId={shop.id}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AllShops;
