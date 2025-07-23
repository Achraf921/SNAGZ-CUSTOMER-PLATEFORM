import React, { useState, useEffect } from "react";

import { FaStore, FaEdit, FaExclamationTriangle } from "react-icons/fa";

const MesBoutiques = () => {
  const [expandedShopId, setExpandedShopId] = useState(null);
  const [editingField, setEditingField] = useState({}); // { [shopId]: fieldName }
  const [editData, setEditData] = useState({}); // { [shopId]: { field: value } }

  // Handle field value change for a shop
  const handleEditFieldChange = (shopId, field, value) => {
    setEditData((prev) => ({
      ...prev,
      [shopId]: {
        ...(prev[shopId] || {}),
        [field]: value,
      },
    }));
  };

  // Handle save for a shop
  const handleSaveShop = async (shopId) => {
    const shopToUpdate = shops.find((s) => s.shopId === shopId);
    if (!shopToUpdate) return;
    const updatedFields = editData[shopId];
    if (!updatedFields) return;
    try {
      setIsLoading(true);
      setError(null);
      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/customer/shops/${userId}/${shopId}`
          : `http://localhost:5000/api/customer/shops/${userId}/${shopId}`;
      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopToUpdate, ...updatedFields }),
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || "Erreur lors de la mise à jour de la boutique"
        );
      // Update local shops state
      setShops((prev) =>
        prev.map((s) => (s.shopId === shopId ? data.shop : s))
      );
      // Reset edit state for this shop
      setEditData((prev) => ({ ...prev, [shopId]: {} }));
      setEditingField((prev) => ({ ...prev, [shopId]: null }));
    } catch (err) {
      setError(
        err.message ||
          "Une erreur est survenue lors de la mise à jour de la boutique"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [userId, setUserId] = useState(null);

  // Get user's sub attribute from storage when component mounts
  useEffect(() => {
    // Try to get userInfo from session or local storage
    let userInfoStr =
      sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
    let sub = null;

    try {
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        // Extract the sub attribute - this is the primary identifier we want to use
        sub = userInfo.sub;
        setUserId(sub);

        console.log("==== MES BOUTIQUES USER INFO ====");
        console.log("User sub from storage:", sub);
        console.log("==== END MES BOUTIQUES USER INFO ====");
      }
    } catch (error) {
      console.error("Error parsing userInfo:", error);
      setError(
        "Erreur lors de la récupération des informations utilisateur. Veuillez vous reconnecter."
      );
    }

    // If no sub found, try to get userId as fallback
    if (!sub) {
      const fallbackUserId =
        sessionStorage.getItem("userId") || localStorage.getItem("userId");
      if (fallbackUserId) {
        console.warn("No sub found, using fallback userId:", fallbackUserId);
        setUserId(fallbackUserId);
      } else {
        console.error("No user identifier found in storage");
        setError(
          "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
        );
        setIsLoading(false);
      }
    }
  }, []);

  // Fetch shops when userId is available
  useEffect(() => {
    const fetchShops = async () => {
      if (!userId) return;
      try {
        setIsLoading(true);
        const apiUrl =
          process.env.NODE_ENV === "production"
            ? `/api/customer/shops/${userId}`
            : `http://localhost:5000/api/customer/shops/${userId}`;

        const response = await fetch(apiUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const text = await response.text();
          throw new Error(text);
        }

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Erreur lors de la récupération des boutiques (${response.status})`
          );
        }
        setShops(data.shops || []);
      } catch (err) {
        console.error("Error fetching shops:", err);
        setError(
          err.message ||
            "Une erreur est survenue lors de la récupération des boutiques"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchShops();
  }, [userId]);

  const handleCreateShop = () => {
    // Navigate to create shop page
    window.location.href = "/client/boutiques/create";
  };

  // Remove unused toggleExpand function

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sna-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des boutiques...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto p-4">
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6"
          role="alert"
        >
          <div className="flex items-center">
            <FaExclamationTriangle className="mr-2" />
            <span className="block sm:inline">{error}</span>
          </div>
          <button
            onClick={handleCreateShop}
            className="mt-4 bg-sna-primary text-white px-4 py-2 rounded-md hover:bg-sna-primary-dark transition duration-300"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Mes Boutiques</h1>
        {shops.length > 0 && (
          <button
            onClick={handleCreateShop}
            className="bg-sna-primary text-white px-4 py-2 rounded-md hover:bg-sna-primary-dark transition duration-300"
          >
            Créer une Boutique
          </button>
        )}
      </div>

      {/* Notification bar for saving changes */}
      {expandedShopId &&
        Object.keys(editData[expandedShopId] || {}).length > 0 && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-sna-primary text-white px-6 py-3 rounded-md shadow-lg flex items-center space-x-4 animate-fade-in">
            <span>Des modifications non enregistrées pour cette boutique.</span>
            <button
              className="bg-white text-sna-primary font-semibold px-4 py-2 rounded shadow hover:bg-gray-100 transition"
              onClick={() => handleSaveShop(expandedShopId)}
            >
              Enregistrer
            </button>
          </div>
        )}
      {shops.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <FaStore className="mx-auto text-gray-400 text-6xl mb-4" />
          <h2 className="text-2xl font-semibold text-gray-700 mb-3">
            Aucune boutique trouvée
          </h2>
          <p className="text-gray-600 mb-6">
            Vous n'avez pas encore créé de boutique. Commencez par créer votre
            première boutique.
          </p>
          <button
            onClick={handleCreateShop}
            className="bg-sna-primary text-white px-6 py-3 rounded-md hover:bg-sna-primary-dark transition duration-300 font-medium"
          >
            Créer ma première boutique
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {shops.map((shop, idx) => {
            const isExpanded = expandedShopId === shop.shopId;

            const localEditData = editData[shop.shopId] || {};

            const editableFields = Object.keys(shop).filter(
              (key) =>
                ![
                  "shopId",
                  "createdAt",
                  "updatedAt",
                  "_id",
                  "status",
                  "logo",
                  "imagesDeLaBoutique",
                  "name",
                  "shopName",
                ].includes(key)
            );
            return (
              <div
                key={shop.shopId}
                className={`bg-white rounded-lg shadow-md transition-shadow duration-300 w-full ${
                  isExpanded ? "border-2 border-sna-primary" : ""
                }`}
              >
                <div
                  className="flex items-center justify-between px-6 py-5 cursor-pointer"
                  onClick={() =>
                    setExpandedShopId(isExpanded ? null : shop.shopId)
                  }
                >
                  <div className="flex items-center gap-4">
                    {shop.logo ? (
                      <img
                        src={shop.logo}
                        alt={`Logo de ${shop.name}`}
                        className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                      />
                    ) : (
                      <FaStore className="text-sna-primary text-2xl" />
                    )}
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-lg font-bold text-gray-800 flex items-center gap-3">
                          {shop.name ||
                            shop.shopName ||
                            shop.nomProjet ||
                            "Boutique"}
                          {/* Status Indicator */}
                          <span className="flex items-center gap-1">
                            <span
                              className={
                                `inline-block w-3 h-3 rounded-full ` +
                                (shop.status === "valid"
                                  ? "bg-green-500"
                                  : "bg-yellow-400")
                              }
                            />
                            <span
                              className={
                                shop.status === "valid"
                                  ? "text-green-600"
                                  : "text-yellow-600"
                              }
                            >
                              {shop.status === "valid"
                                ? "Validée"
                                : "En attente"}
                            </span>
                          </span>
                        </div>
                        {shop.nomProjet && (
                          <div className="text-sm text-gray-500">
                            {shop.nomProjet}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className="text-sna-primary text-2xl ml-4 focus:outline-none"
                    tabIndex={-1}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        transition: "transform 0.2s",
                        transform: isExpanded
                          ? "rotate(90deg)"
                          : "rotate(0deg)",
                      }}
                    >
                      ▶
                    </span>
                  </button>
                </div>
                {isExpanded && (
                  <div className="px-6 pb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editableFields.map((field) => (
                        <div key={field} className="flex flex-col mb-2">
                          <div className="flex justify-between items-center">
                            <div className="text-sm text-gray-500 font-medium">
                              {field
                                .replace(/([A-Z])/g, " $1")
                                .replace(/^./, (str) => str.toUpperCase())}
                            </div>
                            {editingField[shop.shopId] === field ? (
                              <button
                                className="text-gray-400 hover:text-sna-primary ml-2"
                                onClick={() =>
                                  setEditingField({
                                    ...editingField,
                                    [shop.shopId]: null,
                                  })
                                }
                                title="Annuler"
                              >
                                ✕
                              </button>
                            ) : (
                              <button
                                className="text-gray-400 hover:text-sna-primary ml-2"
                                onClick={() =>
                                  setEditingField({
                                    ...editingField,
                                    [shop.shopId]: field,
                                  })
                                }
                                title="Modifier ce champ"
                              >
                                <FaEdit />
                              </button>
                            )}
                          </div>
                          {editingField[shop.shopId] === field ? (
                            field === "typeAbonnementShopify" ? (
                              <div className="flex flex-col gap-2 mt-1">
                                <label className="flex items-center">
                                  <input
                                    type="radio"
                                    name={`typeAbonnementShopify_${shop.shopId}`}
                                    value="mensuel"
                                    checked={
                                      (localEditData[field] ?? shop[field]) ===
                                      "mensuel"
                                    }
                                    onChange={(e) =>
                                      handleEditFieldChange(
                                        shop.shopId,
                                        field,
                                        e.target.value
                                      )
                                    }
                                    className="form-radio h-4 w-4 text-sna-primary border-gray-300"
                                  />
                                  <span className="ml-2">
                                    Abonnement mensuel SHOPIFY (sans engagement)
                                  </span>
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="radio"
                                    name={`typeAbonnementShopify_${shop.shopId}`}
                                    value="annuel"
                                    checked={
                                      (localEditData[field] ?? shop[field]) ===
                                      "annuel"
                                    }
                                    onChange={(e) =>
                                      handleEditFieldChange(
                                        shop.shopId,
                                        field,
                                        e.target.value
                                      )
                                    }
                                    className="form-radio h-4 w-4 text-sna-primary border-gray-300"
                                  />
                                  <span className="ml-2">
                                    Abonnement annuel SHOPIFY (12 mois)
                                  </span>
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="radio"
                                    name={`typeAbonnementShopify_${shop.shopId}`}
                                    value="aucun"
                                    checked={
                                      (localEditData[field] ?? shop[field]) ===
                                        "aucun" ||
                                      (localEditData[field] ?? shop[field]) ===
                                        ""
                                    }
                                    onChange={(e) =>
                                      handleEditFieldChange(
                                        shop.shopId,
                                        field,
                                        e.target.value
                                      )
                                    }
                                    className="form-radio h-4 w-4 text-sna-primary border-gray-300"
                                  />
                                  <span className="ml-2">
                                    Aucun / Pas d'abonnement Shopify géré via ce
                                    projet
                                  </span>
                                </label>
                              </div>
                            ) : // Date fields: use calendar input
                            [
                                "dateMiseEnLigne",
                                "dateCommercialisation",
                                "dateSortieOfficielle",
                              ].includes(field) ? (
                              <input
                                type="date"
                                value={
                                  localEditData[field] !== undefined
                                    ? localEditData[field]
                                    : shop[field] || ""
                                }
                                onChange={(e) =>
                                  handleEditFieldChange(
                                    shop.shopId,
                                    field,
                                    e.target.value
                                  )
                                }
                                inputMode="none"
                                onKeyDown={(e) => e.preventDefault()}
                                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm mt-1 focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
                                autoFocus
                              />
                            ) : // Boolean field: checkbox, else text input
                            typeof shop[field] === "boolean" ||
                              typeof localEditData[field] === "boolean" ||
                              (typeof shop[field] === "string" &&
                                ["true", "false", "oui", "non"].includes(
                                  String(shop[field] || "").toLowerCase()
                                )) ? (
                              <label className="flex items-center gap-2 mt-1">
                                <input
                                  type="checkbox"
                                  checked={
                                    localEditData[field] !== undefined
                                      ? localEditData[field] === true ||
                                        localEditData[field] === "true" ||
                                        localEditData[field] === "oui"
                                      : shop[field] === true ||
                                        shop[field] === "true" ||
                                        shop[field] === "oui"
                                  }
                                  onChange={(e) =>
                                    handleEditFieldChange(
                                      shop.shopId,
                                      field,
                                      e.target.checked
                                    )
                                  }
                                  className="form-checkbox h-5 w-5 text-sna-primary"
                                />
                                <span className="text-base text-gray-900">
                                  {(
                                    localEditData[field] !== undefined
                                      ? localEditData[field]
                                      : shop[field]
                                  )
                                    ? "Oui"
                                    : "Non"}
                                </span>
                              </label>
                            ) : (
                              <input
                                type="text"
                                value={
                                  localEditData[field] !== undefined
                                    ? localEditData[field]
                                    : shop[field] || ""
                                }
                                onChange={(e) =>
                                  handleEditFieldChange(
                                    shop.shopId,
                                    field,
                                    e.target.value
                                  )
                                }
                                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm mt-1 focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
                                autoFocus
                              />
                            )
                          ) : (
                            <div className="mt-1 text-base text-gray-900">
                              {field === "typeAbonnementShopify"
                                ? shop[field] === "mensuel"
                                  ? "Abonnement mensuel SHOPIFY (sans engagement)"
                                  : shop[field] === "annuel"
                                    ? "Abonnement annuel SHOPIFY (12 mois)"
                                    : shop[field] === "aucun" ||
                                        shop[field] === ""
                                      ? "Aucun / Pas d'abonnement Shopify géré via ce projet"
                                      : shop[field] || "-"
                                : [
                                      "dateMiseEnLigne",
                                      "dateCommercialisation",
                                      "dateSortieOfficielle",
                                    ].includes(field)
                                  ? (() => {
                                      const val = shop[field];
                                      if (!val) return "-";
                                      // Accepts both YYYY-MM-DD and ISO strings
                                      const d = new Date(val);
                                      if (isNaN(d)) return val;
                                      return d.toLocaleDateString("fr-FR");
                                    })()
                                  : typeof shop[field] === "boolean"
                                    ? shop[field]
                                      ? "Oui"
                                      : "Non"
                                    : ["true", "false", "oui", "non"].includes(
                                          String(
                                            shop[field] || ""
                                          ).toLowerCase()
                                        )
                                      ? ["true", "oui"].includes(
                                          String(
                                            shop[field] || ""
                                          ).toLowerCase()
                                        )
                                        ? "Oui"
                                        : "Non"
                                      : field === "products" &&
                                          Array.isArray(shop[field])
                                        ? `${shop[field].length} produit(s): ${shop[field].map((p) => p.titre || p.title || "Produit sans titre").join(", ")}`
                                        : typeof shop[field] === "object" &&
                                            shop[field] !== null
                                          ? JSON.stringify(shop[field])
                                          : shop[field] || "-"}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MesBoutiques;
