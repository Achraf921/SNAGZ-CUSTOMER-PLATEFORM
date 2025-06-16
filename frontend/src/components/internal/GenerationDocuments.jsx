import React, { useState, useEffect } from "react";

const GenerationDocuments = () => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    const fetchUndocumentedShops = async () => {
      try {
        const res = await fetch(
          "/api/internal/undocumented-shops" // Placeholder endpoint, to be implemented in backend later
        );
        if (!res.ok) throw new Error("Erreur lors du chargement des boutiques.");
        const data = await res.json();
        setShops(data.shops || []);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    fetchUndocumentedShops();
  }, []);

  const handleGenerate = async (shopId, action) => {
    // action: "generate" | "exists"
    try {
      // Placeholder call – adjust endpoint and payload as needed
      await fetch(`/api/internal/shops/${shopId}/documentation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setConfirmation(
        action === "generate"
          ? "La génération de la documentation a été lancée avec succès."
          : "La documentation a été marquée comme déjà existante."
      );
      // Optimistically remove shop from list
      setShops((prev) => prev.filter((s) => s.shopId !== shopId));
    } catch (err) {
      setError("Erreur lors de l'opération. Veuillez réessayer.");
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
        La documentation ne peut être générée que pour les boutiques <span className="font-semibold">validées</span> et dont le compte client est également <span className="font-semibold">validé</span>.
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
                      className="px-3 py-1 bg-sna-primary text-white rounded hover:bg-sna-primary-dark"
                    >
                      Générer dans SharePoint
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
