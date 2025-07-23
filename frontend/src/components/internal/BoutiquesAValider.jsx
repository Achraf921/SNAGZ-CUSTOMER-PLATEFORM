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
  const [searchTermPending, setSearchTermPending] = useState("");
  const [searchTermValid, setSearchTermValid] = useState("");

  const validationFields = [
    "nomProjet",
    "typeProjet",
    "commercial",
    "demarrageProjet",
    "nomChefProjet",
    "prenomChefProjet",
    "estBoutiqueEnLigne",
    "clientName",
    "createdAt",
    "nomClient",
    "contactsClient",
    "dateMiseEnLigne",
    "dateCommercialisation",
    "dateSortieOfficielle",
    "precommande",
    "dedicaceEnvisagee",
    "typeAbonnementShopify",
    "snaResponsableDesign",
    "moduleDelivengo",
    "moduleMondialRelay",
    "logoUrl",
    "desktopBannerUrl",
    "mobileBannerUrl",
    "faviconUrl",
    "pourcentageSNA",
  ];

  const toggleFieldValidation = (shopId, fieldName) => {
    if (fieldName === "pourcentageSNA") {
      // This field requires input, not just toggling
      return;
    }
    setValidatedFields((prev) => ({
      ...prev,
      [shopId]: {
        ...(prev[shopId] || {}),
        [fieldName]: !prev[shopId]?.[fieldName],
      },
    }));
  };

  const setPourcentageSNA = (shopId, value) => {
    setValidatedFields((prev) => ({
      ...prev,
      [shopId]: {
        ...(prev[shopId] || {}),
        pourcentageSNA: value,
      },
    }));
  };

  const allFieldsValidated = (shopId) => {
    const fields = validatedFields[shopId] || {};
    return validationFields.every((field) => {
      if (field === "pourcentageSNA") {
        // Check if pourcentageSNA has a valid value between 1 and 100
        const value = fields[field];
        return value && !isNaN(value) && value > 0 && value <= 100;
      }
      return fields[field];
    });
  };

  const validateShop = async (shop) => {
    try {
      setValidationInProgress(shop.shopId);

      // Get the Pourcentage SNA value
      const pourcentageSNA = validatedFields[shop.shopId]?.pourcentageSNA;

      if (!pourcentageSNA || pourcentageSNA <= 0 || pourcentageSNA > 100) {
        setError("Le pourcentage SNA doit être entre 1 et 100%");
        setValidationInProgress(null);
        return;
      }

      const response = await fetch(
        `/api/internal/clients/${shop.clientId}/shops/${shop.shopId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            status: "valid",
            pourcentageSNA: pourcentageSNA,
          }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || "Failed to validate shop");
      }

      setShops((prev) => ({
        pending: prev.pending.filter((s) => s.shopId !== shop.shopId),
        valid: [
          ...prev.valid,
          { ...shop, status: "valid", pourcentageSNA: pourcentageSNA },
        ],
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
        `/api/internal/clients/${shop.clientId}/shops/${shop.shopId}`,
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
        pending: shopsArray.filter((shop) => shop.status !== "valid"),
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

  // Filter functions for search
  const filteredPendingShops = shops.pending.filter((shop) => {
    if (!searchTermPending) return true;
    const searchLower = searchTermPending.toLowerCase();
    return (
      shop.name.toLowerCase().includes(searchLower) ||
      shop.clientName.toLowerCase().includes(searchLower)
    );
  });

  const filteredValidShops = shops.valid.filter((shop) => {
    if (!searchTermValid) return true;
    const searchLower = searchTermValid.toLowerCase();
    return (
      shop.name.toLowerCase().includes(searchLower) ||
      shop.clientName.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Validation des Boutiques
      </h1>

      <div className="space-y-8">
        {/* Pending Shops Section */}
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-yellow-700">
              Boutiques en attente ({shops.pending.length})
            </h2>
            <input
              type="text"
              placeholder="Rechercher une boutique en attente..."
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
              value={searchTermPending}
              onChange={(e) => setSearchTermPending(e.target.value)}
            />
          </div>

          {filteredPendingShops.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">
                {searchTermPending
                  ? "Aucune boutique en attente trouvée avec ce terme de recherche"
                  : "Aucune boutique en attente"}
              </p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-yellow-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Nom de la Boutique
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Client
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
                  {filteredPendingShops.map((shop) => (
                    <React.Fragment key={shop.shopId}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FaStore className="mr-2 text-blue-700" />
                            <span className="text-sm font-medium text-gray-900">
                              {shop.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shop.clientName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            En attente
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => toggleShop(shop)}
                            className={`font-medium ${
                              expandedShop === shop.shopId
                                ? "text-blue-600 hover:text-blue-900"
                                : "text-green-600 hover:text-green-900"
                            }`}
                          >
                            {expandedShop === shop.shopId
                              ? "Fermer"
                              : "Valider"}
                          </button>
                        </td>
                      </tr>
                      {expandedShop === shop.shopId && (
                        <tr className="bg-gray-50">
                          <td colSpan="4" className="p-6">
                            <div className="space-y-4">
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
                                          : field === "demarrageProjet"
                                            ? "Démarrage du projet"
                                            : field === "nomChefProjet"
                                              ? "Nom chef de projet"
                                              : field === "prenomChefProjet"
                                                ? "Prénom chef de projet"
                                                : field === "estBoutiqueEnLigne"
                                                  ? "Est Boutique En Ligne"
                                                  : field === "clientName"
                                                    ? "Client"
                                                    : field === "createdAt"
                                                      ? "Date de Création"
                                                      : field === "nomClient"
                                                        ? "Nom Client"
                                                        : field ===
                                                            "contactsClient"
                                                          ? "Contacts Client"
                                                          : field ===
                                                              "dateMiseEnLigne"
                                                            ? "Date Mise En Ligne"
                                                            : field ===
                                                                "dateCommercialisation"
                                                              ? "Date Commercialisation"
                                                              : field ===
                                                                  "dateSortieOfficielle"
                                                                ? "Date Sortie Officielle"
                                                                : field ===
                                                                    "precommande"
                                                                  ? "Precommande"
                                                                  : field ===
                                                                      "dedicaceEnvisagee"
                                                                    ? "Dédicace Envisagée"
                                                                    : field ===
                                                                        "typeAbonnementShopify"
                                                                      ? "Type Abonnement Shopify"
                                                                      : field ===
                                                                          "snaResponsableDesign"
                                                                        ? "SNA Responsable Design"
                                                                        : field ===
                                                                            "moduleDelivengo"
                                                                          ? "Module Delivengo"
                                                                          : field ===
                                                                              "moduleMondialRelay"
                                                                            ? "Module Mondial Relay"
                                                                            : field ===
                                                                                "logoUrl"
                                                                              ? "Logo"
                                                                              : field ===
                                                                                  "desktopBannerUrl"
                                                                                ? "Bannière Desktop"
                                                                                : field ===
                                                                                    "mobileBannerUrl"
                                                                                  ? "Bannière Mobile"
                                                                                  : field ===
                                                                                      "faviconUrl"
                                                                                    ? "Favicon"
                                                                                    : field ===
                                                                                        "pourcentageSNA"
                                                                                      ? "Pourcentage SNA"
                                                                                      : field}
                                  </span>
                                  <div className="flex-1 flex flex-col">
                                    {field === "pourcentageSNA" ? (
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="number"
                                          min="1"
                                          max="100"
                                          step="0.1"
                                          placeholder="Ex: 15.5"
                                          value={
                                            validatedFields[shop.shopId]
                                              ?.pourcentageSNA || ""
                                          }
                                          onChange={(e) =>
                                            setPourcentageSNA(
                                              shop.shopId,
                                              parseFloat(e.target.value)
                                            )
                                          }
                                          className={`px-3 py-2 border rounded flex-1 ${
                                            validatedFields[shop.shopId]
                                              ?.pourcentageSNA &&
                                            validatedFields[shop.shopId]
                                              ?.pourcentageSNA > 0 &&
                                            validatedFields[shop.shopId]
                                              ?.pourcentageSNA <= 100
                                              ? "border-green-200 bg-green-50"
                                              : "border-gray-300"
                                          }`}
                                        />
                                        <span className="text-sm text-gray-500">
                                          %
                                        </span>
                                      </div>
                                    ) : (
                                      <span
                                        className={`px-3 py-2 rounded bg-gray-50 border ${
                                          validatedFields[shop.shopId]?.[field]
                                            ? "bg-green-50 border-green-200"
                                            : ""
                                        }`}
                                      >
                                        {(() => {
                                          const value =
                                            shop[field] || shop.shop?.[field];
                                          // Handle boolean fields that should display Oui/Non
                                          if (
                                            field === "moduleDelivengo" ||
                                            field === "moduleMondialRelay" ||
                                            field === "estBoutiqueEnLigne" ||
                                            field === "dedicaceEnvisagee" ||
                                            field === "precommande"
                                          ) {
                                            if (
                                              value === true ||
                                              value === "true" ||
                                              value === "Oui"
                                            )
                                              return "Oui";
                                            if (
                                              value === false ||
                                              value === "false" ||
                                              value === "Non" ||
                                              value === "" ||
                                              value === null ||
                                              value === undefined
                                            )
                                              return "Non";
                                          }
                                          // Handle date formatting for Date Sortie Officielle, Date de Création, and Démarrage du projet
                                          if (
                                            (field === "dateSortieOfficielle" ||
                                              field === "createdAt" ||
                                              field === "demarrageProjet") &&
                                            value
                                          ) {
                                            const date = new Date(value);
                                            if (!isNaN(date.getTime())) {
                                              return date
                                                .toISOString()
                                                .split("T")[0]; // YYYY-MM-DD format
                                            }
                                          }
                                          return value || "-";
                                        })()}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() =>
                                      toggleFieldValidation(shop.shopId, field)
                                    }
                                    className={`ml-2 p-2 rounded-full hover:bg-gray-200 flex-shrink-0 ${
                                      field === "pourcentageSNA"
                                        ? "pointer-events-none"
                                        : ""
                                    }`}
                                  >
                                    {field === "pourcentageSNA" ? (
                                      validatedFields[shop.shopId]
                                        ?.pourcentageSNA &&
                                      validatedFields[shop.shopId]
                                        ?.pourcentageSNA > 0 &&
                                      validatedFields[shop.shopId]
                                        ?.pourcentageSNA <= 100 ? (
                                        <FaCheckCircle className="text-green-500 text-lg" />
                                      ) : (
                                        <FaRegCheckCircle className="text-gray-400" />
                                      )
                                    ) : validatedFields[shop.shopId]?.[
                                        field
                                      ] ? (
                                      <FaCheckCircle className="text-green-500 text-lg" />
                                    ) : (
                                      <FaRegCheckCircle className="text-gray-400" />
                                    )}
                                  </button>
                                </div>
                              ))}

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
        {/* Valid Shops Section */}
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-green-700">
              Boutiques validées ({shops.valid.length})
            </h2>
            <input
              type="text"
              placeholder="Rechercher une boutique validée..."
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
              value={searchTermValid}
              onChange={(e) => setSearchTermValid(e.target.value)}
            />
          </div>
          {filteredValidShops.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">
                {searchTermValid
                  ? "Aucune boutique validée trouvée avec ce terme de recherche"
                  : "Aucune boutique validée"}
              </p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-green-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Nom de la Boutique
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Client
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
                  {filteredValidShops.map((shop) => (
                    <React.Fragment key={shop.shopId}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FaStore className="mr-2 text-blue-700" />
                            <span className="text-sm font-medium text-gray-900">
                              {shop.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {shop.clientName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Validée
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => toggleShop(shop)}
                            className="text-blue-600 hover:text-blue-900 font-medium mr-4"
                          >
                            {expandedShop === shop.shopId
                              ? "Fermer"
                              : "Voir détails"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmUnvalidate(shop);
                            }}
                            className="text-red-600 hover:text-red-900 font-medium"
                          >
                            Annuler validation
                          </button>
                        </td>
                      </tr>
                      {expandedShop === shop.shopId && (
                        <tr className="bg-gray-50">
                          <td colSpan="4" className="p-6">
                            <div className="space-y-4">
                              <h4 className="font-medium text-gray-700 mb-3 border-b pb-2">
                                Informations du Projet - Boutique validée
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
                                          : field === "demarrageProjet"
                                            ? "Démarrage du projet"
                                            : field === "nomChefProjet"
                                              ? "Nom chef de projet"
                                              : field === "prenomChefProjet"
                                                ? "Prénom chef de projet"
                                                : field === "estBoutiqueEnLigne"
                                                  ? "Est Boutique En Ligne"
                                                  : field === "clientName"
                                                    ? "Client"
                                                    : field === "createdAt"
                                                      ? "Date de Création"
                                                      : field === "nomClient"
                                                        ? "Nom Client"
                                                        : field ===
                                                            "contactsClient"
                                                          ? "Contacts Client"
                                                          : field ===
                                                              "dateMiseEnLigne"
                                                            ? "Date Mise En Ligne"
                                                            : field ===
                                                                "dateCommercialisation"
                                                              ? "Date Commercialisation"
                                                              : field ===
                                                                  "dateSortieOfficielle"
                                                                ? "Date Sortie Officielle"
                                                                : field ===
                                                                    "precommande"
                                                                  ? "Precommande"
                                                                  : field ===
                                                                      "dedicaceEnvisagee"
                                                                    ? "Dédicace Envisagée"
                                                                    : field ===
                                                                        "typeAbonnementShopify"
                                                                      ? "Type Abonnement Shopify"
                                                                      : field ===
                                                                          "snaResponsableDesign"
                                                                        ? "SNA Responsable Design"
                                                                        : field ===
                                                                            "moduleDelivengo"
                                                                          ? "Module Delivengo"
                                                                          : field ===
                                                                              "moduleMondialRelay"
                                                                            ? "Module Mondial Relay"
                                                                            : field ===
                                                                                "logoUrl"
                                                                              ? "Logo"
                                                                              : field ===
                                                                                  "desktopBannerUrl"
                                                                                ? "Bannière Desktop"
                                                                                : field ===
                                                                                    "mobileBannerUrl"
                                                                                  ? "Bannière Mobile"
                                                                                  : field ===
                                                                                      "faviconUrl"
                                                                                    ? "Favicon"
                                                                                    : "Pourcentage SNA"}
                                  </span>
                                  <div className="flex-1 flex flex-col">
                                    <span className="px-3 py-2 rounded bg-green-50 border border-green-200">
                                      {(() => {
                                        const value =
                                          shop[field] || shop.shop?.[field];
                                        // Handle boolean fields that should display Oui/Non
                                        if (
                                          field === "moduleDelivengo" ||
                                          field === "moduleMondialRelay" ||
                                          field === "estBoutiqueEnLigne" ||
                                          field === "dedicaceEnvisagee" ||
                                          field === "precommande"
                                        ) {
                                          if (
                                            value === true ||
                                            value === "true" ||
                                            value === "Oui"
                                          )
                                            return "Oui";
                                          if (
                                            value === false ||
                                            value === "false" ||
                                            value === "Non" ||
                                            value === "" ||
                                            value === null ||
                                            value === undefined
                                          )
                                            return "Non";
                                        }
                                        // Handle date formatting for Date Sortie Officielle, Date de Création, and Démarrage du projet
                                        if (
                                          (field === "dateSortieOfficielle" ||
                                            field === "createdAt" ||
                                            field === "demarrageProjet") &&
                                          value
                                        ) {
                                          const date = new Date(value);
                                          if (!isNaN(date.getTime())) {
                                            return date
                                              .toISOString()
                                              .split("T")[0]; // YYYY-MM-DD format
                                          }
                                        }
                                        return value || "-";
                                      })()}
                                    </span>
                                  </div>
                                  <div className="ml-2 p-2 flex-shrink-0">
                                    <FaCheckCircle className="text-green-500 text-lg" />
                                  </div>
                                </div>
                              ))}
                            </div>
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
      </div>

      {/* Unvalidate Confirmation Modal */}
      {showUnvalidateConfirm && (
        <div className="fixed inset-0 z-50 flex justify-center items-center">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black opacity-50"></div>
          {/* Modal */}
          <div className="relative bg-white rounded-lg shadow p-6 z-10 min-w-[320px]">
            <h2 className="text-lg font-bold text-gray-800 mb-2">
              Confirmation
            </h2>
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
