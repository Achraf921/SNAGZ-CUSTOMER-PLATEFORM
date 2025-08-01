import React, { useState, useEffect } from "react";

const DocumentationSection = () => {
  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);
  const [generatingShops, setGeneratingShops] = useState(new Set()); // Track shops currently generating documentation
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false); // Disable all doc buttons while any doc in progress
  const [searchTerm, setSearchTerm] = useState("");
  const [shopProducts, setShopProducts] = useState({}); // Store products for each shop
  const [expandedShops, setExpandedShops] = useState(new Set()); // Track which shops have expanded product sections
  const [productCounts, setProductCounts] = useState({}); // Store product counts for each shop

  // New state for bulk product management
  const [selectedProducts, setSelectedProducts] = useState({}); // Track selected products per shop: {shopId: Set(productIds)}
  const [bulkActionLoading, setBulkActionLoading] = useState({}); // Track bulk action loading per shop: {shopId: boolean}

  // New state for individual product documentation
  const [documentingProducts, setDocumentingProducts] = useState(new Set()); // Track individual products being documented
  const [showSharePointModal, setShowSharePointModal] = useState(null); // {shopId, productId, action} for SharePoint warning modal

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const response = await fetch("/api/internal/all?details=true");
        if (!response.ok)
          throw new Error("Erreur lors du chargement des boutiques");
        const data = await response.json();

        // Filter and transform shops data
        const processedShops = (data.customers || []).reduce(
          (acc, customer) => {
            // Only process active customers
            if (customer.status === "active" && Array.isArray(customer.shops)) {
              // Filter for valid shops only
              const validShops = customer.shops
                .filter((shop) => shop.status === "valid")
                .map((shop) => ({
                  ...shop,
                  customerName: customer.raisonSociale,
                  customerId: customer._id,
                  customerStatus: customer.status,
                }));
              return [...acc, ...validShops];
            }
            return acc;
          },
          []
        );

        setShops(processedShops);
        // Fetch product counts for all shops
        processedShops.forEach((shop) => {
          fetchProductCount(shop.shopId);
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchProductCount = async (shopId) => {
      try {
        const response = await fetch(`/api/internal/shop/${shopId}/products`);
        if (!response.ok) return;
        const data = await response.json();

        setProductCounts((prev) => ({
          ...prev,
          [shopId]: data.products?.length || 0,
        }));
      } catch (err) {
        console.error("Error fetching product count for shop:", shopId, err);
        // Set count to 0 on error
        setProductCounts((prev) => ({
          ...prev,
          [shopId]: 0,
        }));
      }
    };

    fetchShops();
  }, []);

  const fetchShopProducts = async (shopId) => {
    try {
      const response = await fetch(`/api/internal/shop/${shopId}/products`);
      if (!response.ok)
        throw new Error("Erreur lors du chargement des produits");
      const data = await response.json();

      setShopProducts((prev) => ({
        ...prev,
        [shopId]: data.products || [],
      }));
    } catch (err) {
      console.error("Error fetching shop products:", err);
      setNotification({
        type: "error",
        message: "Erreur lors du chargement des produits: " + err.message,
      });
    }
  };

  const toggleShopProducts = async (shopId) => {
    if (expandedShops.has(shopId)) {
      // Collapse
      setExpandedShops((prev) => {
        const newSet = new Set(prev);
        newSet.delete(shopId);
        return newSet;
      });
    } else {
      // Expand and fetch products if not already loaded
      if (!shopProducts[shopId]) {
        await fetchShopProducts(shopId);
      }
      setExpandedShops((prev) => new Set(prev).add(shopId));
    }
  };

  // Bulk product selection functions
  const toggleProductSelection = (shopId, productId) => {
    setSelectedProducts((prev) => {
      const shopSelections = prev[shopId] || new Set();
      const newShopSelections = new Set(shopSelections);

      if (newShopSelections.has(productId)) {
        newShopSelections.delete(productId);
      } else {
        newShopSelections.add(productId);
      }

      return {
        ...prev,
        [shopId]: newShopSelections,
      };
    });
  };

  const selectAllProducts = (shopId, selectAll) => {
    setSelectedProducts((prev) => {
      const products = shopProducts[shopId] || [];
      const undocumentedProducts = products.filter((p) => !p.documented);

      return {
        ...prev,
        [shopId]: selectAll
          ? new Set(undocumentedProducts.map((p) => p.productId))
          : new Set(),
      };
    });
  };

  const getSelectedCount = (shopId) => {
    return selectedProducts[shopId]?.size || 0;
  };

  const getUndocumentedCount = (shopId) => {
    const products = shopProducts[shopId] || [];
    return products.filter((p) => !p.documented).length;
  };

  const handleBulkAction = async (shopId, action) => {
    const selectedIds = selectedProducts[shopId];
    if (!selectedIds || selectedIds.size === 0) {
      setNotification({
        type: "error",
        message: "Veuillez sélectionner au moins un produit",
      });
      return;
    }

    setBulkActionLoading((prev) => ({ ...prev, [shopId]: true }));

    try {
      const response = await fetch(
        `/api/internal/shop/${shopId}/products/bulk-documentation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            productIds: Array.from(selectedIds),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Erreur lors de l'action sur les produits"
        );
      }

      // Update local product state for all affected products
      setShopProducts((prev) => ({
        ...prev,
        [shopId]:
          prev[shopId]?.map((product) =>
            selectedIds.has(product.productId)
              ? {
                  ...product,
                  documented:
                    action === "document" || action === "mark_documented",
                }
              : product
          ) || [],
      }));

      // Clear selections for this shop
      setSelectedProducts((prev) => ({
        ...prev,
        [shopId]: new Set(),
      }));

      setNotification({
        type: "success",
        message:
          result.message ||
          `${selectedIds.size} produit(s) ${action === "document" ? "documenté(s)" : "marqué(s) comme documenté(s)"} avec succès`,
      });
    } catch (err) {
      setNotification({
        type: "error",
        message: "Erreur: " + err.message,
      });
    } finally {
      setBulkActionLoading((prev) => ({ ...prev, [shopId]: false }));
    }
  };

  const handleProductAction = async (shopId, productId, action) => {
    const productKey = `${shopId}-${productId}`;

    try {
      // Set loading state for this specific product
      setDocumentingProducts((prev) => new Set([...prev, productKey]));

      const response = await fetch(
        `/api/internal/shop/${shopId}/product/${productId}/documentation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Erreur lors de l'action sur le produit"
        );
      }

      // Update local product state
      setShopProducts((prev) => ({
        ...prev,
        [shopId]:
          prev[shopId]?.map((product) =>
            product.productId === productId
              ? { ...product, documented: result.documented }
              : product
          ) || [],
      }));

      setNotification({
        type: "success",
        message: result.message,
      });
    } catch (err) {
      setNotification({
        type: "error",
        message: "Erreur: " + err.message,
      });
    } finally {
      // Remove loading state for this specific product
      setDocumentingProducts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(productKey);
        return newSet;
      });
    }
  };

  const handleDocumentationAction = async (
    shopId,
    action,
    forceOverwrite = false
  ) => {
    // Show loading state for SharePoint generation
    if (action === "document") {
      setGeneratingShops((prev) => new Set(prev).add(shopId));
      setIsGeneratingDocs(true);
    }

    try {
      const response = await fetch(
        `/api/internal/shop/${shopId}/documentation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action, forceOverwrite }),
        }
      );

      const result = await response.json();

      // Handle the special case where documentation already exists
      if (
        response.status === 409 &&
        result.message === "DOCUMENTATION_EXISTS"
      ) {
        setNotification({
          type: "overwrite_confirmation",
          message:
            "La documentation existe déjà pour cette boutique. Voulez-vous la remplacer ou simplement marquer la boutique comme documentée ?",
          shopId,
          onOverwrite: () => {
            setNotification(null);
            handleDocumentationAction(shopId, "document", true); // Retry with forceOverwrite
          },
          onMarkDocumented: () => {
            setNotification(null);
            handleDocumentationAction(shopId, "mark_documented");
          },
          onCancel: () => setNotification(null),
        });
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.message || "Erreur lors de la mise à jour de la documentation"
        );
      }

      // Update local state
      setShops((prevShops) =>
        prevShops.map((shop) =>
          shop.shopId === shopId
            ? {
                ...shop,
                documented: result.documented,
              }
            : shop
        )
      );

      // Show success message using the message from backend
      setNotification({
        type: "success",
        message: result.message,
      });
    } catch (err) {
      setNotification({
        type: "error",
        message: "Erreur: " + err.message,
      });
    } finally {
      // Remove loading state
      if (action === "document") {
        setGeneratingShops((prev) => {
          const newSet = new Set(prev);
          newSet.delete(shopId);
          return newSet;
        });
        setIsGeneratingDocs(false);
      }
    }
  };

  const handleActionConfirmation = (shopId, action) => {
    let message = "";
    switch (action) {
      case "mark_documented":
        message =
          "Êtes-vous sûr de vouloir marquer cette boutique comme déjà documentée ?";
        break;
      case "document":
        message =
          "Êtes-vous sûr de vouloir générer la documentation SharePoint pour cette boutique ?";
        break;
      case "undocument":
        message =
          "⚠️ ATTENTION: Cette action ne supprimera que le statut 'documenté' dans la base de données. Si une documentation existe dans SharePoint, elle y restera et devra être supprimée manuellement.\n\nÊtes-vous sûr de vouloir continuer ?";
        break;
      default:
        return;
    }

    setNotification({
      type: "confirmation",
      message,
      onConfirm: () => {
        handleDocumentationAction(shopId, action);
        setNotification(null);
      },
      onCancel: () => setNotification(null),
    });
  };

  const handleProductActionConfirmation = (shopId, productId, action) => {
    // For document action, show SharePoint modal first
    if (action === "document") {
      setShowSharePointModal({ shopId, productId, action });
      return;
    }

    // For other actions, show normal confirmation
    let message = "";
    switch (action) {
      case "mark_documented":
        message =
          "Êtes-vous sûr de vouloir marquer ce produit comme déjà documenté ?";
        break;
      case "undocument":
        message =
          "⚠️ ATTENTION: Cette action marquera seulement le produit comme 'non documenté' dans la base de données.\n\n🔒 SÉCURITÉ: Le produit ne sera PAS supprimé des documents SharePoint existants (comme les Fiches Produits). Les données restent protégées dans SharePoint et devront être gérées manuellement si nécessaire.\n\nÊtes-vous sûr de vouloir continuer ?";
        break;
      default:
        return;
    }

    setNotification({
      type: "confirmation",
      message,
      onConfirm: () => {
        handleProductAction(shopId, productId, action);
        setNotification(null);
      },
      onCancel: () => setNotification(null),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sna-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Erreur</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Notification Modal */}
      {notification && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center">
              {notification.type === "confirmation" ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Confirmation
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">
                    {notification.message}
                  </p>
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={notification.onCancel}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={notification.onConfirm}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Confirmer
                    </button>
                  </div>
                </>
              ) : notification.type === "overwrite_confirmation" ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Documentation existante
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">
                    {notification.message}
                  </p>
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={notification.onMarkDocumented}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Marquer comme documentée
                    </button>
                    <button
                      onClick={notification.onCancel}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Annuler
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
                      notification.type === "success"
                        ? "bg-green-100"
                        : "bg-red-100"
                    }`}
                  >
                    {notification.type === "success" ? (
                      <svg
                        className="h-6 w-6 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-6 w-6 text-red-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">
                    {notification.type === "success" ? "Succès" : "Erreur"}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    {notification.message}
                  </p>
                  <div className="mt-6">
                    <button
                      onClick={() => setNotification(null)}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Fermer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            Générer la documentation
          </h2>
          <input
            type="text"
            placeholder="Rechercher une boutique ou un client..."
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Seules les boutiques{" "}
                <span className="font-semibold">validées</span> des clients{" "}
                <span className="font-semibold">actifs</span> peuvent être
                documentées.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {shops
            .filter(
              (shop) =>
                shop.nomProjet
                  ?.toLowerCase()
                  .includes(searchTerm.toLowerCase()) ||
                shop.customerName
                  ?.toLowerCase()
                  .includes(searchTerm.toLowerCase())
            )
            .map((shop) => (
              <li key={shop.shopId} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-sna-primary truncate">
                        {shop.nomProjet}
                      </p>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Boutique validée
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          Client: {shop.customerName}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                        <p>
                          Statut documentation:{" "}
                          <span
                            className={`font-medium ${
                              shop.documented === "documented" ||
                              shop.documented === true
                                ? "text-green-600"
                                : "text-yellow-600"
                            }`}
                          >
                            {shop.documented === "documented" ||
                            shop.documented === true
                              ? "Documentée"
                              : "Non documentée"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0 flex space-x-4">
                    {shop.documented !== "documented" &&
                    shop.documented !== true ? (
                      <>
                        <button
                          onClick={() =>
                            handleActionConfirmation(
                              shop.shopId,
                              "mark_documented"
                            )
                          }
                          disabled={
                            generatingShops.size > 0 || isGeneratingDocs
                          }
                          className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary ${
                            generatingShops.size > 0 || isGeneratingDocs
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "text-gray-700 bg-white hover:bg-gray-50"
                          }`}
                        >
                          Boutique déjà documentée
                        </button>
                        <button
                          onClick={() =>
                            handleActionConfirmation(shop.shopId, "document")
                          }
                          disabled={
                            generatingShops.size > 0 ||
                            isGeneratingDocs ||
                            documentingProducts.size > 0
                          }
                          className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary ${
                            generatingShops.size > 0 ||
                            isGeneratingDocs ||
                            documentingProducts.size > 0
                              ? "bg-gray-400 cursor-not-allowed"
                              : "bg-sna-primary hover:bg-sna-primary/90"
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
                            "Générer documentation SharePoint"
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() =>
                          handleActionConfirmation(shop.shopId, "undocument")
                        }
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Supprimer documentation
                      </button>
                    )}
                  </div>
                </div>

                {/* Product Management Section */}
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => toggleShopProducts(shop.shopId)}
                    className="flex items-center justify-between w-full text-xs font-medium text-gray-600 hover:text-sna-primary hover:bg-gray-50 p-1.5 rounded-md transition-colors"
                  >
                    <div className="flex items-center">
                      <svg
                        className={`w-4 h-4 mr-2 transform transition-transform ${
                          expandedShops.has(shop.shopId) ? "rotate-90" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <span>Gérer les produits</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {productCounts[shop.shopId] !== undefined ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          {productCounts[shop.shopId]}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          <svg
                            className="animate-spin -ml-1 mr-1 h-2 w-2 text-gray-500"
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
                          ...
                        </span>
                      )}
                    </div>
                  </button>

                  {expandedShops.has(shop.shopId) && (
                    <div className="mt-2 bg-gray-50 rounded p-2 border border-gray-100">
                      {shopProducts[shop.shopId]?.length === 0 ? (
                        <div className="text-center py-3">
                          <svg
                            className="mx-auto h-6 w-6 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1}
                              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m13-8l-3 3-3-3m-4 8l3-3 3 3"
                            />
                          </svg>
                          <p className="mt-1 text-xs text-gray-500">
                            Aucun produit valide trouvé
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Bulk Selection Controls */}
                          {getUndocumentedCount(shop.shopId) > 0 && (
                            <div className="mb-3 p-2 bg-white rounded border border-gray-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <label className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={
                                        getSelectedCount(shop.shopId) ===
                                          getUndocumentedCount(shop.shopId) &&
                                        getUndocumentedCount(shop.shopId) > 0
                                      }
                                      onChange={(e) =>
                                        selectAllProducts(
                                          shop.shopId,
                                          e.target.checked
                                        )
                                      }
                                      className="h-4 w-4 text-sna-primary focus:ring-sna-primary border-gray-300 rounded"
                                    />
                                    <span className="ml-2 text-xs font-medium text-gray-700">
                                      Sélectionner tout (
                                      {getUndocumentedCount(shop.shopId)})
                                    </span>
                                  </label>
                                  {getSelectedCount(shop.shopId) > 0 && (
                                    <span className="text-xs text-sna-primary font-medium">
                                      {getSelectedCount(shop.shopId)}{" "}
                                      sélectionné(s)
                                    </span>
                                  )}
                                </div>

                                {getSelectedCount(shop.shopId) > 0 && (
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() =>
                                        handleBulkAction(
                                          shop.shopId,
                                          "document"
                                        )
                                      }
                                      disabled={
                                        bulkActionLoading[shop.shopId] ||
                                        isGeneratingDocs
                                      }
                                      className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white focus:outline-none transition-colors ${
                                        bulkActionLoading[shop.shopId] ||
                                        isGeneratingDocs
                                          ? "bg-gray-400 cursor-not-allowed"
                                          : "bg-sna-primary hover:bg-sna-primary/90"
                                      }`}
                                    >
                                      {bulkActionLoading[shop.shopId] ? (
                                        <svg
                                          className="animate-spin -ml-1 mr-1 h-3 w-3 text-white"
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
                                      ) : null}
                                      Documenter sélection
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleBulkAction(
                                          shop.shopId,
                                          "mark_documented"
                                        )
                                      }
                                      disabled={
                                        bulkActionLoading[shop.shopId] ||
                                        isGeneratingDocs
                                      }
                                      className={`inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-white focus:outline-none transition-colors ${
                                        bulkActionLoading[shop.shopId] ||
                                        isGeneratingDocs
                                          ? "bg-gray-300 cursor-not-allowed"
                                          : "bg-green-600 hover:bg-green-700"
                                      }`}
                                    >
                                      Marquer sélection
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Individual Product List */}
                          <div className="space-y-2">
                            {shopProducts[shop.shopId]?.map((product) => (
                              <div
                                key={product.productId}
                                className="bg-white p-2 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                                    {!product.documented && (
                                      <input
                                        type="checkbox"
                                        checked={
                                          selectedProducts[shop.shopId]?.has(
                                            product.productId
                                          ) || false
                                        }
                                        onChange={() =>
                                          toggleProductSelection(
                                            shop.shopId,
                                            product.productId
                                          )
                                        }
                                        className="h-4 w-4 text-sna-primary focus:ring-sna-primary border-gray-300 rounded"
                                      />
                                    )}
                                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                                      <h4 className="text-xs font-medium text-gray-900 truncate">
                                        {product.titre}
                                      </h4>
                                      <span
                                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                          product.documented
                                            ? "bg-green-100 text-green-800"
                                            : "bg-yellow-100 text-yellow-800"
                                        }`}
                                      >
                                        {product.documented ? "✓" : "○"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="ml-2 flex-shrink-0">
                                    <div className="flex space-x-1">
                                      {!product.documented ? (
                                        <>
                                          <button
                                            onClick={() =>
                                              handleProductActionConfirmation(
                                                shop.shopId,
                                                product.productId,
                                                "document"
                                              )
                                            }
                                            disabled={
                                              isGeneratingDocs ||
                                              generatingShops.size > 0 ||
                                              documentingProducts.has(
                                                `${shop.shopId}-${product.productId}`
                                              ) ||
                                              documentingProducts.size > 0
                                            }
                                            className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white focus:outline-none transition-colors ${
                                              isGeneratingDocs ||
                                              generatingShops.size > 0 ||
                                              documentingProducts.has(
                                                `${shop.shopId}-${product.productId}`
                                              ) ||
                                              documentingProducts.size > 0
                                                ? "bg-gray-400 cursor-not-allowed"
                                                : "bg-sna-primary hover:bg-sna-primary/90"
                                            }`}
                                            title="Documenter ce produit dans SharePoint"
                                          >
                                            {documentingProducts.has(
                                              `${shop.shopId}-${product.productId}`
                                            ) ? (
                                              <div className="flex items-center">
                                                <div className="animate-spin rounded-full h-3 w-3 border-t border-white mr-1"></div>
                                                Documentation...
                                              </div>
                                            ) : (
                                              "Documenter"
                                            )}
                                          </button>
                                          <button
                                            onClick={() =>
                                              handleProductActionConfirmation(
                                                shop.shopId,
                                                product.productId,
                                                "mark_documented"
                                              )
                                            }
                                            disabled={
                                              isGeneratingDocs ||
                                              generatingShops.size > 0
                                            }
                                            className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white focus:outline-none transition-colors ${
                                              isGeneratingDocs ||
                                              generatingShops.size > 0
                                                ? "bg-gray-300 cursor-not-allowed"
                                                : "bg-green-600 hover:bg-green-700"
                                            }`}
                                            title="Marquer comme déjà documenté"
                                          >
                                            Marquer documenté
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() =>
                                            handleProductActionConfirmation(
                                              shop.shopId,
                                              product.productId,
                                              "undocument"
                                            )
                                          }
                                          disabled={
                                            isGeneratingDocs ||
                                            generatingShops.size > 0
                                          }
                                          className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white focus:outline-none transition-colors ${
                                            isGeneratingDocs ||
                                            generatingShops.size > 0
                                              ? "bg-gray-300 cursor-not-allowed"
                                              : "bg-red-600 hover:bg-red-700"
                                          }`}
                                          title="Supprimer la documentation"
                                        >
                                          Supprimer doc
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </div>

      {/* SharePoint Warning Modal */}
      {showSharePointModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
                <svg
                  className="h-6 w-6 text-yellow-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="mt-2 text-center">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  ⚠️ Attention SharePoint
                </h3>
                <div className="mt-4">
                  <p className="text-sm text-gray-600">
                    <strong>Important:</strong> Avant de documenter ce produit,
                    veuillez vous assurer que le document
                    <strong> "Fiches Produits Shopify"</strong> est{" "}
                    <strong>fermé dans SharePoint</strong>.
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    📝 <strong>Pourquoi ?</strong> Si le document est ouvert
                    dans SharePoint, la documentation pourrait ne pas
                    s'effectuer correctement.
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    ✅ <strong>Une fois fermé</strong>, cliquez sur "Documenter"
                    pour continuer.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex space-x-3">
                <button
                  onClick={() => setShowSharePointModal(null)}
                  className="flex-1 inline-flex justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    const { shopId, productId, action } = showSharePointModal;
                    setShowSharePointModal(null);
                    handleProductAction(shopId, productId, action);
                  }}
                  className="flex-1 inline-flex justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                >
                  Documenter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentationSection;
