import React, { useState, useEffect } from "react";

const GenerationDocuments = () => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [generatingShops, setGeneratingShops] = useState(new Set()); // Track shops currently generating documentation

  useEffect(() => {
    const fetchUndocumentedShops = async () => {
      try {
        const res = await fetch(
          "/api/internal/undocumented-shops" // Placeholder endpoint, to be implemented in backend later
        );
        if (!res.ok)
          throw new Error("Erreur lors du chargement des boutiques.");
        const data = await res.json();
        setShops(data.shops || []);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    fetchUndocumentedShops();
  }, []);

  const handleGenerate = async (shopId, actionType) => {
    const action = actionType === "generate" ? "document" : "mark_documented";

    // Show loading state for SharePoint generation
    if (action === "document") {
      setGeneratingShops((prev) => new Set(prev).add(shopId));
    }

    try {
      const response = await fetch(
        `/api/customer/shop/${shopId}/documentation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Erreur lors de l'opération");
      }

      setConfirmation(result.message);
      // Optimistically remove shop from list
      setShops((prev) => prev.filter((s) => s.shopId !== shopId));
    } catch (err) {
      setError("Erreur: " + err.message);
    } finally {
      // Remove loading state
      if (action === "document") {
        setGeneratingShops((prev) => {
          const newSet = new Set(prev);
          newSet.delete(shopId);
          return newSet;
        });
      }
    }
  };

  if (loading) return <p>Chargement...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        Génération de documents
      </h1>

      <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 rounded">
        La documentation ne peut être générée que pour les boutiques{" "}
        <span className="font-semibold">validées</span> et dont le compte client
        est également <span className="font-semibold">validé</span>.
      </div>

      {confirmation && (
        <div className="p-4 bg-green-50 border-l-4 border-green-400 text-green-700 rounded">
          {confirmation}
        </div>
      )}

      {shops.length === 0 ? (
        <p>Aucune boutique nécessitant une documentation.</p>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nom Boutique
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {shops.map((shop) => (
                <tr key={shop.shopId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {shop.nomProjet || shop.name || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {shop.clientName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap space-x-4">
                    <button
                      onClick={() => handleGenerate(shop.shopId, "generate")}
                      disabled={generatingShops.has(shop.shopId)}
                      className={`px-3 py-1 text-white rounded inline-flex items-center ${
                        generatingShops.has(shop.shopId)
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-sna-primary hover:bg-sna-primary-dark"
                      }`}
                    >
                      {generatingShops.has(shop.shopId) ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Génération en cours...
                        </>
                      ) : (
                        "Générer dans SharePoint"
                      )}
                    </button>
                    <button
                      onClick={() => handleGenerate(shop.shopId, "exists")}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Documentation déjà existante
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GenerationDocuments;
