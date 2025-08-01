import React, { useState, useEffect } from "react";

import { FaStore, FaEdit, FaExclamationTriangle } from "react-icons/fa";

const MesBoutiques = () => {
  const [expandedShopId, setExpandedShopId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
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

    console.log("Saving shop:", shopId);

    try {
      setIsLoading(true);
      setError(null);

      // Handle image uploads first
      const imageFields = [
        "logoFile",
        "desktopBannerFile",
        "mobileBannerFile",
        "faviconFile",
      ];
      const uploadPromises = [];

      for (const imageField of imageFields) {
        const imageType = imageField.replace("File", "");
        const file = updatedFields[imageField];

        console.log(`Checking ${imageField}:`, file ? "File found" : "No file");
        if (file) {
          const formData = new FormData();
          formData.append("image", file);
          formData.append("shopId", shopId);
          formData.append("imageType", imageType);

          const apiUrl = `/api/customer/shops/${userId}/${shopId}/upload-image`;

          const uploadPromise = fetch(apiUrl, {
            method: "POST",
            body: formData,
            credentials: "include",
          }).then(async (response) => {
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(
                errorData.message || `HTTP error! status: ${response.status}`
              );
            }
            const data = await response.json();
            if (!data.success) {
              throw new Error(data.message || "Failed to upload image");
            }
            return { imageType, imageUrl: data.imageUrl };
          });

          uploadPromises.push(uploadPromise);
        }
      }

      // Wait for all image uploads to complete
      const uploadResults = await Promise.all(uploadPromises);

      // Create clean updated fields without file references and temporary URLs
      const cleanUpdatedFields = { ...updatedFields };

      // Remove file references
      imageFields.forEach((field) => delete cleanUpdatedFields[field]);

      // Remove temporary base64 URLs that were used for preview
      const imageTypesToClean = [
        "logo",
        "desktopBanner",
        "mobileBanner",
        "favicon",
      ];
      imageTypesToClean.forEach((imageType) => {
        if (
          cleanUpdatedFields[`${imageType}Url`] &&
          cleanUpdatedFields[`${imageType}Url`].startsWith("data:")
        ) {
          delete cleanUpdatedFields[`${imageType}Url`];
        }
      });

      // Update the shop data with new S3 keys from S3
      const updatedShopData = { ...shopToUpdate, ...cleanUpdatedFields };
      uploadResults.forEach(({ imageType, imageUrl }) => {
        // Store the S3 key instead of the URL
        updatedShopData[`${imageType}S3Key`] = imageUrl; // imageUrl is actually the S3 key
      });

      // Update shop data
      const apiUrl = `/api/customer/shops/${userId}/${shopId}`;

      // Remove the large data URL from logging to avoid console spam
      const logData = { ...updatedShopData };
      const imageTypesForLog = [
        "logo",
        "desktopBanner",
        "mobileBanner",
        "favicon",
      ];
      imageTypesForLog.forEach((imageType) => {
        if (
          logData[`${imageType}Url`] &&
          logData[`${imageType}Url`].startsWith("data:")
        ) {
          logData[`${imageType}Url`] = "[BASE64_DATA_URL]";
        }
      });
      console.log("Sending updated shop data:", logData);

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedShopData),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok)
        throw new Error(
          data.message || "Erreur lors de la mise à jour de la boutique"
        );

      // Update local shops state with the actual S3 URLs from the response
      setShops((prev) =>
        prev.map((s) => {
          if (s.shopId === shopId) {
            // Update with the response data which contains the actual S3 URLs
            const updatedShop = { ...s, ...data.shop };

            // Ensure we're using the S3 keys, not the temporary data URLs
            uploadResults.forEach(({ imageType, imageUrl }) => {
              updatedShop[`${imageType}S3Key`] = imageUrl; // imageUrl is actually the S3 key
            });

            return updatedShop;
          }
          return s;
        })
      );

      // Reset edit state for this shop
      setEditData((prev) => ({ ...prev, [shopId]: {} }));
      setEditingField((prev) => ({ ...prev, [shopId]: null }));
    } catch (err) {
      setError(
        err.message ||
          "Une erreur est survenue lors de la mise à jour de la boutique"
      );

      // Revert the preview images if save failed
      const imageFieldsToRevert = [
        "logoFile",
        "desktopBannerFile",
        "mobileBannerFile",
        "faviconFile",
      ];
      setShops((prev) =>
        prev.map((s) => {
          if (s.shopId === shopId) {
            // Revert to original image URLs
            const revertedShop = { ...s };
            imageFieldsToRevert.forEach((imageField) => {
              const imageType = imageField.replace("File", "");
              // Keep the original URL, remove any temporary preview
              delete revertedShop[`${imageType}Url`];
            });
            return revertedShop;
          }
          return s;
        })
      );
    } finally {
      setIsLoading(false);
    }
  };

  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageChangeInputs, setImageChangeInputs] = useState({});

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
        const apiUrl = `/api/customer/shops/${userId}`;

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

  const handleImageChange = async (shopId, imageType, file) => {
    if (!file) return;

    try {
      // Create a data URL for immediate preview only
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;

        // Update the shop's image URL temporarily for preview only
        setShops((prev) =>
          prev.map((shop) =>
            shop.shopId === shopId
              ? { ...shop, [`${imageType}Url`]: dataUrl }
              : shop
          )
        );
      };

      reader.readAsDataURL(file);

      // Store only the file for later upload, NOT the data URL
      setEditData((prev) => ({
        ...prev,
        [shopId]: {
          ...prev[shopId],
          [`${imageType}File`]: file, // Store the file for later upload
        },
      }));

      console.log(`Image change triggered for ${imageType} in shop ${shopId}`);
    } catch (error) {
      console.error(`Error handling image change for ${imageType}:`, error);
    }
  };

  const triggerImageInput = (shopId, imageType) => {
    const inputId = `${shopId}-${imageType}`;
    setImageChangeInputs((prev) => ({ ...prev, [inputId]: true }));

    // Create a hidden file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        handleImageChange(shopId, imageType, file);
      }
      setImageChangeInputs((prev) => ({ ...prev, [inputId]: false }));
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
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

  // Filter shops based on search term
  const filteredShops = shops.filter((shop) => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const shopName = (
      shop.name ||
      shop.shopName ||
      shop.nomProjet ||
      ""
    ).toLowerCase();
    const projectName = (shop.nomProjet || "").toLowerCase();
    const shopifyDomain = (shop.shopifyDomain || "").toLowerCase();

    return (
      shopName.includes(searchLower) ||
      projectName.includes(searchLower) ||
      shopifyDomain.includes(searchLower)
    );
  });

  return (
    <div>
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

        {/* Search bar - positioned on the left */}
        <div className="mb-6">
          <div className="relative max-w-sm">
            <input
              type="text"
              placeholder="Rechercher une boutique..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sna-primary focus:border-transparent shadow-sm"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results counter */}
        {searchTerm && (
          <div className="mb-4 text-sm text-gray-600">
            {filteredShops.length} boutique
            {filteredShops.length !== 1 ? "s" : ""} trouvée
            {filteredShops.length !== 1 ? "s" : ""}
          </div>
        )}

        {/* Notification bar for saving changes */}
        {expandedShopId &&
          Object.keys(editData[expandedShopId] || {}).length > 0 && (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-sna-primary text-white px-6 py-3 rounded-md shadow-lg flex items-center space-x-4 animate-fade-in">
              <span>
                Des modifications non enregistrées pour cette boutique.
              </span>
              <button
                className="bg-white text-sna-primary font-semibold px-4 py-2 rounded shadow hover:bg-gray-100 transition"
                onClick={() => handleSaveShop(expandedShopId)}
              >
                Enregistrer
              </button>
            </div>
          )}
        {filteredShops.length === 0 && !searchTerm ? (
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
        ) : filteredShops.length === 0 && searchTerm ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h2 className="text-2xl font-semibold text-gray-700 mb-3">
              Aucune boutique trouvée
            </h2>
            <p className="text-gray-600 mb-6">
              Aucune boutique ne correspond à votre recherche "{searchTerm}".
            </p>
            <button
              onClick={() => setSearchTerm("")}
              className="bg-sna-primary text-white px-4 py-2 rounded-md hover:bg-sna-primary-dark transition duration-300"
            >
              Voir toutes les boutiques
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {filteredShops.map((shop, idx) => {
              const isExpanded = expandedShopId === shop.shopId;

              const localEditData = editData[shop.shopId] || {};

              // Fields that should not be rendered at all
              const hiddenFields = [
                "shopId",
                "createdAt",
                "updatedAt",
                "_id",
                "status",
                "logo",
                "imagesDeLaBoutique",
                "name",
                "shopName",
                "coutsEtDetailsMaintenanceSite",
                "coutsEtDetailsModuleMondialRelay",
                "coutsEtDetailsModuleDelivengo",
                "hasShopify",
                "documented",
                "nomClient",
                "logoUrl",
                "logoS3Key",
                "desktopBannerUrl",
                "desktopBannerS3Key",
                "mobileBannerUrl",
                "mobileBannerS3Key",
                "faviconUrl",
                "faviconS3Key",
                "clientId",
                "clientName",
                "themeName",
                "parametrizedAt",
                "dawnThemePushedAt",
                "currentThemeId",
                "dawnThemePushed",
                "shopifyConfig",
                "unparametrizedDate",
                "shopifySetupStatus",
                "shopifySetupCompleted",
                "isParametrized",
                "products",
                "lastModified",
              ];

              // Fields that should be read-only (no edit icon)
              const readOnlyFields = [
                "shopifyDomain",
                "shopifyAdminUrl",
                "pourcentageSNA",
              ];

              const editableFields = Object.keys(shop).filter(
                (key) => !hiddenFields.includes(key)
              );

              // Debug: Log shop data to see field names (only for first shop to avoid spam)
              if (idx === 0) {
                console.log("Shop data for debugging:", {
                  shopId: shop.shopId,
                  hasPourcentageSNA: "pourcentageSNA" in shop,
                  hasShopifyDomain: "shopifyDomain" in shop,
                  hasShopifyAdminUrl: "shopifyAdminUrl" in shop,
                  logoUrl: shop.logoUrl,
                  logoS3Key: shop.logoS3Key,
                  mobileBannerUrl: shop.mobileBannerUrl,
                  mobileBannerS3Key: shop.mobileBannerS3Key,
                });
              }
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
                                <div className="flex space-x-2">
                                  <button
                                    className="text-green-600 hover:text-green-800 text-sm font-medium"
                                    onClick={() => handleSaveShop(shop.shopId)}
                                    title="Sauvegarder"
                                  >
                                    Sauvegarder
                                  </button>
                                  <button
                                    className="text-gray-400 hover:text-red-600 ml-2"
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
                                </div>
                              ) : !readOnlyFields.includes(field) ? (
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
                              ) : null}
                            </div>
                            {editingField[shop.shopId] === field ? (
                              [
                                "demarrageProjet",
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
                                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm mt-1 focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
                                  autoFocus
                                />
                              ) : field === "typeAbonnementShopify" ? (
                                <div className="flex flex-col gap-2 mt-1">
                                  <label className="flex items-center">
                                    <input
                                      type="radio"
                                      name={`typeAbonnementShopify_${shop.shopId}`}
                                      value="mensuel"
                                      checked={
                                        (localEditData[field] ??
                                          shop[field]) === "mensuel"
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
                                      Abonnement mensuel SHOPIFY (sans
                                      engagement)
                                    </span>
                                  </label>
                                  <label className="flex items-center">
                                    <input
                                      type="radio"
                                      name={`typeAbonnementShopify_${shop.shopId}`}
                                      value="annuel"
                                      checked={
                                        (localEditData[field] ??
                                          shop[field]) === "annuel"
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
                                        (localEditData[field] ??
                                          shop[field]) === "aucun" ||
                                        (localEditData[field] ??
                                          shop[field]) === ""
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
                                      Aucun / Pas d'abonnement Shopify géré via
                                      ce projet
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
                                      : [
                                            "true",
                                            "false",
                                            "oui",
                                            "non",
                                          ].includes(
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

                      {/* Shop Images Section - Moved to bottom */}
                      {(shop.logoUrl ||
                        shop.logoS3Key ||
                        shop.desktopBannerUrl ||
                        shop.desktopBannerS3Key ||
                        shop.mobileBannerUrl ||
                        shop.mobileBannerS3Key ||
                        shop.faviconUrl ||
                        shop.faviconS3Key) && (
                        <div className="mt-6 border-t border-gray-200 pt-6">
                          <h3 className="text-lg font-semibold text-gray-800 mb-4">
                            Images de la boutique
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {(shop.logoUrl || shop.logoS3Key) && (
                              <div className="flex flex-col items-center">
                                <div className="relative group">
                                  <img
                                    src={
                                      shop.logoS3Key
                                        ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/logo?t=${Date.now()}`
                                        : shop.logoUrl || ""
                                    }
                                    alt="Logo de la boutique"
                                    className="h-20 w-20 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                                    onError={(e) => {
                                      console.error(
                                        "Failed to load logo image:",
                                        shop.logoS3Key || shop.logoUrl
                                      );
                                      console.error(
                                        "Image source:",
                                        e.target.src
                                      );
                                      console.error("Shop data:", {
                                        logoS3Key: shop.logoS3Key,
                                        logoUrl: shop.logoUrl,
                                        shopId: shop.shopId,
                                      });
                                      // Don't hide the image, just log the error
                                      // The image might still be loading or there might be a temporary issue
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Changer l'image"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        triggerImageInput(shop.shopId, "logo");
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Télécharger"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const imageUrl = shop.logoS3Key
                                            ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/logo?t=${Date.now()}`
                                            : shop.logoUrl;
                                          const link =
                                            document.createElement("a");
                                          link.href = imageUrl;
                                          link.download = "logo-boutique.png";
                                          link.click();
                                        } catch (error) {
                                          console.error(
                                            "Error downloading logo:",
                                            error
                                          );
                                        }
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 mt-1">
                                  Logo
                                </span>
                              </div>
                            )}
                            {(shop.desktopBannerUrl ||
                              shop.desktopBannerS3Key) && (
                              <div className="flex flex-col items-center">
                                <div className="relative group">
                                  <img
                                    src={
                                      shop.desktopBannerS3Key
                                        ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/desktopBanner?t=${Date.now()}`
                                        : shop.desktopBannerUrl
                                    }
                                    alt="Bannière desktop"
                                    className="h-20 w-40 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Changer l'image"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        triggerImageInput(
                                          shop.shopId,
                                          "desktopBanner"
                                        );
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Télécharger"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const imageUrl =
                                            shop.desktopBannerS3Key
                                              ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/desktopBanner?t=${Date.now()}`
                                              : shop.desktopBannerUrl;
                                          const link =
                                            document.createElement("a");
                                          link.href = imageUrl;
                                          link.download =
                                            "banniere-desktop.png";
                                          link.click();
                                        } catch (error) {
                                          console.error(
                                            "Error downloading desktop banner:",
                                            error
                                          );
                                        }
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 mt-1">
                                  Bannière Desktop
                                </span>
                              </div>
                            )}
                            {(shop.mobileBannerUrl ||
                              shop.mobileBannerS3Key) && (
                              <div className="flex flex-col items-center">
                                <div className="relative group">
                                  <img
                                    src={
                                      shop.mobileBannerS3Key
                                        ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/mobileBanner?t=${Date.now()}`
                                        : shop.mobileBannerUrl
                                    }
                                    alt="Bannière mobile"
                                    className="h-20 w-32 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Changer l'image"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        triggerImageInput(
                                          shop.shopId,
                                          "mobileBanner"
                                        );
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Télécharger"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const imageUrl =
                                            shop.mobileBannerS3Key
                                              ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/mobileBanner?t=${Date.now()}`
                                              : shop.mobileBannerUrl;
                                          const link =
                                            document.createElement("a");
                                          link.href = imageUrl;
                                          link.download = "banniere-mobile.png";
                                          link.click();
                                        } catch (error) {
                                          console.error(
                                            "Error downloading mobile banner:",
                                            error
                                          );
                                        }
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 mt-1">
                                  Bannière Mobile
                                </span>
                              </div>
                            )}
                            {(shop.faviconUrl || shop.faviconS3Key) && (
                              <div className="flex flex-col items-center">
                                <div className="relative group">
                                  <img
                                    src={
                                      shop.faviconS3Key
                                        ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/favicon?t=${Date.now()}`
                                        : shop.faviconUrl
                                    }
                                    alt="Favicon"
                                    className="h-20 w-20 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Changer l'image"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        triggerImageInput(
                                          shop.shopId,
                                          "favicon"
                                        );
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                      title="Télécharger"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const imageUrl = shop.faviconS3Key
                                            ? `/api/customer/shops/${userId}/${shop.shopId}/image-proxy/favicon?t=${Date.now()}`
                                            : shop.faviconUrl;
                                          const link =
                                            document.createElement("a");
                                          link.href = imageUrl;
                                          link.download = "favicon.ico";
                                          link.click();
                                        } catch (error) {
                                          console.error(
                                            "Error downloading favicon:",
                                            error
                                          );
                                        }
                                      }}
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500 mt-1">
                                  Favicon
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MesBoutiques;
