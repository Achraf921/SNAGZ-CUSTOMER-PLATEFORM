import React, { useState, useEffect } from "react";
// Removed: import { useParams, Link } from "react-router-dom";

const ClientShops = ({ clientId }) => {
  // const { clientId } = useParams(); // Removed, clientId needs to be passed as a prop or fetched from URL manually if needed
  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch shops for the client - replace with your actual API call
    const fetchClientShops = async () => {
      try {
        // Example: const response = await fetch(`/api/internal/clients/${clientId}/shops`);
        // const data = await response.json();
        // setShops(data);
        setShops([
          { id: "shop1", name: "Boutique Alpha", products: 5 },
          { id: "shop2", name: "Magasin Beta", products: 12 },
        ]); // Mock data
      } catch (err) {
        setError(err.message);
      }
      setIsLoading(false);
    };
    if (clientId) fetchClientShops();
  }, [clientId]);

  if (isLoading) return <p>Chargement des boutiques du client...</p>;
  if (error) return <p>Erreur: {error}</p>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Boutiques du Client: {clientId}
      </h1>

      {shops.length === 0 ? (
        <p>Ce client n'a pas encore de boutiques.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shops.map((shop) => (
            <div
              key={shop.id}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300"
            >
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                {shop.name}
              </h2>
              <p className="text-sm text-gray-500 mb-1">
                Nombre de produits: {shop.products}
              </p>
              {/* Add more shop details here */}
              <div className="mt-4 flex justify-end">
                <a
                  href={`/internal/clients/${clientId}/boutiques/${shop.id}`} // Replaced Link
                  className="text-sm text-sna-primary hover:underline"
                >
                  Voir Détails
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientShops;
