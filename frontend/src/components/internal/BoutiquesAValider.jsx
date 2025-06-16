import React, { useState, useEffect } from "react";
import { FaStore, FaCheckCircle, FaRegCheckCircle } from "react-icons/fa";

export default function BoutiquesAValider() {
  const [shops, setShops] = useState({
    pending: [],
    valid: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedShop, setExpandedShop] = useState(null);
  const [validatedFields, setValidatedFields] = useState({});
  const [validationInProgress, setValidationInProgress] = useState(null);
  const [showUnvalidateConfirm, setShowUnvalidateConfirm] = useState(false);
  const [shopToUnvalidate, setShopToUnvalidate] = useState(null);

  const validationFields = [
    "nomProjet",
    "typeProjet",
    "commercial",
    "estBoutiqueEnLigne",
    "clientName",
    "createdAt",
    "nomClient",
    "contactsClient",
    "compteClientRef",
    "dateMiseEnLigne",
    "dateCommercialisation",
    "dateSortieOfficielle",
    "precommande",
    "dedicaceEnvisagee",
    "typeAbonnementShopify",
    "snaResponsableDesign",
    "moduleDelivengo",
    "moduleMondialRelay",
  ];

  const toggleFieldValidation = (shopId, fieldName) => {
    setValidatedFields((prev) => ({
      ...prev,
      [shopId]: {
        ...(prev[shopId] || {}),
        [fieldName]: !prev[shopId]?.[fieldName],
      },
    }));
  };

  const allFieldsValidated = (shopId) => {
    const fields = validatedFields[shopId] || {};
    return validationFields.every((field) => fields[field]);
  };

  const validateShop = async (shop) => {
    try {
      setValidationInProgress(shop.shopId);

      const response = await fetch(
        `/api/customer/clients/${shop.clientId}/shops/${shop.shopId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ status: "valid" }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Failed to validate shop");
      }

      setShops((prev) => ({
        pending: prev.pending.filter((s) => s.shopId !== shop.shopId),
        valid: [...prev.valid, { ...shop, status: "valid" }],
      }));

      setExpandedShop(null);
      setValidationInProgress(null);
    } catch (error) {
      console.error("Error validating shop:", error);
      setError("Failed to validate shop");
      setValidationInProgress(null);
    }
  };

  const unvalidateShop = async (shop) => {
    try {
      setValidationInProgress(shop.shopId);

      const response = await fetch(
        `/api/customer/clients/${shop.clientId}/shops/${shop.shopId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ status: "pending" }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Failed to unvalidate shop");
      }

      setShops((prev) => ({
        pending: [...prev.pending, { ...shop, status: "pending" }],
        valid: prev.valid.filter((s) => s.shopId !== shop.shopId),
      }));

      setExpandedShop(null);
      setValidationInProgress(null);
      setShowUnvalidateConfirm(false);
    } catch (error) {
      console.error("Error unvalidating shop:", error);
      setError("Failed to unvalidate shop");
      setValidationInProgress(null);
      setShowUnvalidateConfirm(false);
    }
  };

  const confirmUnvalidate = (shop) => {
    setShopToUnvalidate(shop);
    setShowUnvalidateConfirm(true);
  };

  const cancelUnvalidate = () => {
    setShowUnvalidateConfirm(false);
    setShopToUnvalidate(null);
  };

  const toggleShop = (shop) => {
    const isExpanding = expandedShop !== shop.shopId;
    setExpandedShop(isExpanding ? shop.shopId : null);
    setValidationInProgress(isExpanding ? shop.shopId : null);

    if (isExpanding) {
      // Initialize validated fields if not already set
      setValidatedFields((prev) => ({
        ...prev,
        [shop.shopId]: prev[shop.shopId] || {},
      }));
      fetchShopDetails(shop);
    }
  };

  const fetchShops = async () => {
    try {
      const response = await fetch("/api/internal/all-shops", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Cache-Control": "no-cache",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch shops");
      }

      const data = await response.json();
      const shopsArray = Array.isArray(data.shops) ? data.shops : [];

      setShops({
        pending: shopsArray.filter((shop) => shop.status === "pending"),
        valid: shopsArray.filter((shop) => shop.status === "valid"),
      });
    } catch (err) {
      console.error("Error fetching shops:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchShopDetails = async (shop) => {
    try {
      const response = await fetch(
        `/api/internal/clients/${shop.clientId}/shops/${shop.shopId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Cache-Control": "no-cache",
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch shop details");
      }

      const responseData = await response.json();
      const detailedShop = responseData.shop || responseData;

      setShops((prev) => ({
        pending: prev.pending.map((s) =>
          s.shopId === shop.shopId ? { ...s, ...detailedShop } : s
        ),
        valid: prev.valid.map((s) =>
          s.shopId === shop.shopId ? { ...s, ...detailedShop } : s
        ),
      }));
    } catch (err) {
      console.error("Error fetching shop details:", err);
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Boutiques à Valider
        </h1>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>Error loading shops: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Boutiques à Valider
        </h1>
        <p className="text-gray-600">
          Liste complète des boutiques en attente de validation
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Shops Column */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-yellow-700 bg-yellow-50 p-3 rounded-lg">
            Boutiques en attente ({shops.pending.length})
          </h2>
          {shops.pending.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">Aucune boutique en attente</p>
            </div>
          ) : (
            shops.pending.map((shop) => (
              <div
                key={shop.shopId}
                className="bg-white rounded-lg shadow overflow-hidden"
              >
                <div
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleShop(shop)}
                >
                  <div>
                    <h3 className="font-semibold text-lg flex items-center">
                      <FaStore className="mr-2 text-blue-600" />
                      {shop.name}
                    </h3>
                    <p className="text-sm text-gray-600">{shop.clientName}</p>
                  </div>
                  <div className="flex items-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        shop.status === "valid"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {shop.status === "valid" ? "Validée" : "En attente"}
                    </span>
                    <button
                      onClick={() => toggleShop(shop)}
                      className="ml-4 px-3 py-1 rounded text-white bg-green-500 hover:bg-green-600"
                    >
                      {validationInProgress === shop.shopId
                        ? "En cours..."
                        : "Valider"}
                    </button>
                  </div>
                </div>

                {expandedShop === shop.shopId && (
                  <div className="p-4 bg-gray-50">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700 mb-3 border-b pb-2">
                          Informations du Projet
                        </h4>
                        {validationFields.map((field) => (
                          <div
                            key={field}
                            className="flex items-start py-3 border-b border-gray-100"
                          >
                            <span className="font-medium w-1/3 text-gray-700">
                              {field === "nomProjet"
                                ? "Nom Projet"
                                : field === "typeProjet"
                                ? "Type Projet"
                                : field === "commercial"
                                ? "Commercial"
                                : field === "estBoutiqueEnLigne"
                                ? "Est Boutique En Ligne"
                                : field === "clientName"
                                ? "Client"
                                : field === "createdAt"
                                ? "Date de Création"
                                : field === "nomClient"
                                ? "Nom Client"
                                : field === "contactsClient"
                                ? "Contacts Client"
                                : field === "compteClientRef"
                                ? "Compte Client Ref"
                                : field === "dateMiseEnLigne"
                                ? "Date Mise En Ligne"
                                : field === "dateCommercialisation"
                                ? "Date Commercialisation"
                                : field === "dateSortieOfficielle"
                                ? "Date Sortie Officielle"
                                : field === "precommande"
                                ? "Precommande"
                                : field === "dedicaceEnvisagee"
                                ? "Dédicace Envisagée"
                                : field === "typeAbonnementShopify"
                                ? "Type Abonnement Shopify"
                                : field === "snaResponsableDesign"
                                ? "SNA Responsable Design"
                                : field === "moduleDelivengo"
                                ? "Module Delivengo"
                                : "Module Mondial Relay"}
                            </span>
                            <div className="flex-1 flex flex-col">
                              <span
                                className={`px-3 py-2 rounded bg-gray-50 border ${
                                  validatedFields[shop.shopId]?.[field]
                                    ? "bg-green-50 border-green-200"
                                    : ""
                                }`}
                              >
                                {shop[field] || shop.shop?.[field] || "-"}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                toggleFieldValidation(shop.shopId, field)
                              }
                              className="ml-2 p-2 rounded-full hover:bg-gray-200 flex-shrink-0"
                            >
                              {validatedFields[shop.shopId]?.[field] ? (
                                <FaCheckCircle className="text-green-500 text-lg" />
                              ) : (
                                <FaRegCheckCircle className="text-gray-400" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={() => validateShop(shop)}
                          disabled={!allFieldsValidated(shop.shopId)}
                          className={`px-4 py-2 rounded ${
                            allFieldsValidated(shop.shopId)
                              ? "bg-green-500 hover:bg-green-600 text-white"
                              : "bg-gray-300 text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          {validationInProgress === shop.shopId
                            ? "Validation en cours..."
                            : "Valider la boutique"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Valid Shops Column */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-green-700 bg-green-50 p-3 rounded-lg">
            Boutiques validées ({shops.valid.length})
          </h2>
          {shops.valid.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">Aucune boutique validée</p>
            </div>
          ) : (
            shops.valid.map((shop) => (
              <div
                key={shop.shopId}
                className="bg-white rounded-lg shadow overflow-hidden border border-gray-200"
              >
                <div
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleShop(shop)}
                >
                  <div>
                    <h3 className="font-semibold text-lg flex items-center">
                      <FaStore className="mr-2 text-blue-600" />
                      {shop.name}
                    </h3>
                    <p className="text-sm text-gray-600">{shop.clientName}</p>
                  </div>
                  <div className="flex items-center">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Validée
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmUnvalidate(shop);
                      }}
                      className="ml-4 px-3 py-1 rounded text-yellow-800 bg-yellow-100 hover:bg-yellow-200"
                    >
                      Annuler la validation
                    </button>
                  </div>
                </div>

                {expandedShop === shop.shopId && (
                  <div className="p-4 bg-gray-50">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700 mb-3 border-b pb-2">
                          Informations du Projet
                        </h4>
                        {validationFields.map((field) => (
                          <div
                            key={field}
                            className="flex items-start py-3 border-b border-gray-100"
                          >
                            <span className="font-medium w-1/3 text-gray-700">
                              {field === "nomProjet"
                                ? "Nom Projet"
                                : field === "typeProjet"
                                ? "Type Projet"
                                : field === "commercial"
                                ? "Commercial"
                                : field === "estBoutiqueEnLigne"
                                ? "Est Boutique En Ligne"
                                : field === "clientName"
                                ? "Client"
                                : field === "createdAt"
                                ? "Date de Création"
                                : field === "nomClient"
                                ? "Nom Client"
                                : field === "contactsClient"
                                ? "Contacts Client"
                                : field === "compteClientRef"
                                ? "Compte Client Ref"
                                : field === "dateMiseEnLigne"
                                ? "Date Mise En Ligne"
                                : field === "dateCommercialisation"
                                ? "Date Commercialisation"
                                : field === "dateSortieOfficielle"
                                ? "Date Sortie Officielle"
                                : field === "precommande"
                                ? "Precommande"
                                : field === "dedicaceEnvisagee"
                                ? "Dédicace Envisagée"
                                : field === "typeAbonnementShopify"
                                ? "Type Abonnement Shopify"
                                : field === "snaResponsableDesign"
                                ? "SNA Responsable Design"
                                : field === "moduleDelivengo"
                                ? "Module Delivengo"
                                : "Module Mondial Relay"}
                            </span>
                            <div className="flex-1 flex flex-col">
                              <span
                                className={`px-3 py-2 rounded bg-gray-50 border ${
                                  validatedFields[shop.shopId]?.[field]
                                    ? "bg-green-50 border-green-200"
                                    : ""
                                }`}
                              >
                                {shop[field] || shop.shop?.[field] || "-"}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                toggleFieldValidation(shop.shopId, field)
                              }
                              className="ml-2 p-2 rounded-full hover:bg-gray-200 flex-shrink-0"
                            >
                              {validatedFields[shop.shopId]?.[field] ? (
                                <FaCheckCircle className="text-green-500 text-lg" />
                              ) : (
                                <FaRegCheckCircle className="text-gray-400" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 flex justify-end">
                        <button
                          onClick={() => validateShop(shop)}
                          disabled={!allFieldsValidated(shop.shopId)}
                          className={`px-4 py-2 rounded ${
                            allFieldsValidated(shop.shopId)
                              ? "bg-green-500 hover:bg-green-600 text-white"
                              : "bg-gray-300 text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          {validationInProgress === shop.shopId
                            ? "Validation en cours..."
                            : "Valider la boutique"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Unvalidate Confirmation Modal */}
      {showUnvalidateConfirm && (
  <div className="fixed inset-0 z-50 flex justify-center items-center">
    {/* Overlay */}
    <div className="absolute inset-0 bg-black opacity-50"></div>
    {/* Modal */}
    <div className="relative bg-white rounded-lg shadow p-6 z-10 min-w-[320px]">
      <h2 className="text-lg font-bold text-gray-800 mb-2">Confirmation</h2>
      <p className="text-gray-600 mb-4">
        Êtes-vous sûr de vouloir annuler la validation de cette boutique ?
      </p>
      <div className="flex justify-end">
        <button
          onClick={cancelUnvalidate}
          className="px-4 py-2 rounded bg-gray-300 text-gray-500 hover:bg-gray-400"
        >
          Annuler
        </button>
        <button
          onClick={() => unvalidateShop(shopToUnvalidate)}
          className="ml-4 px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-600 text-white"
        >
          Confirmer
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
