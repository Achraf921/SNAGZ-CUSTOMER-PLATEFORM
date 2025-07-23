import React, { useEffect, useState } from "react";
import {
  FaInfoCircle,
  FaSearch,
  FaBox,
  FaBarcode,
  FaTags,
  FaShoppingCart,
  FaTimes,
  FaExclamationTriangle,
  FaSpinner,
} from "react-icons/fa";
import NotificationModal from "../../shared/NotificationModal";

const FicheProduitsShopify = () => {
  const [shops, setShops] = useState([]);
  const [expandedShops, setExpandedShops] = useState(new Set());
  const [shopProducts, setShopProducts] = useState({});
  const [selectedProducts, setSelectedProducts] = useState({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [shopSearch, setShopSearch] = useState("");
  const [productSearch, setProductSearch] = useState({});
  const [modal, setModal] = useState({ open: false });

  // State for domain input modal
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const [shopNeedingDomain, setShopNeedingDomain] = useState(null);
  const [adminUrl, setAdminUrl] = useState("");
  const [isSavingDomain, setIsSavingDomain] = useState(false);

  const loadShops = async () => {
    try {
      const res = await fetch("/api/customer/all?details=true");
      const data = await res.json();
      const collected = [];
      (data.customers || []).forEach((c) => {
        (c.shops || []).forEach((s) => {
          if (s.hasShopify) {
            const shopifyConfig = s.shopifyConfig || {
              apiKey: s["shopifyConfig.apiKey"],
              apiSecret: s["shopifyConfig.apiSecret"],
              accessToken: s["shopifyConfig.accessToken"],
            };

            collected.push({
              ...s,
              shopifyConfig,
              customerName: c.raisonSociale,
              clientId: c._id?.toString() || c.id,
            });
          }
        });
      });
      setShops(collected);

      // Preload documented products counts so filtering works
      const productsMap = {};
      await Promise.all(
        collected.map(async (s) => {
          try {
            const res2 = await fetch(`/api/customer/shop/${s.shopId}/products`);
            const data2 = await res2.json();
            productsMap[s.shopId] = (data2.products || []).filter(
              (p) => p.documented === true
            );
          } catch (e) {
            console.error("Preload products error", e);
            productsMap[s.shopId] = [];
          }
        })
      );
      setShopProducts(productsMap);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  const fetchProducts = async (shopId) => {
    if (shopProducts[shopId]) return; // already loaded
    const res = await fetch(`/api/customer/shop/${shopId}/products`);
    const data = await res.json();
    const products = (data.products || []).filter((p) => p.documented === true);
    setShopProducts((prev) => ({ ...prev, [shopId]: products }));
  };

  const toggleShop = async (shopId) => {
    if (expandedShops.has(shopId)) {
      const newSet = new Set(expandedShops);
      newSet.delete(shopId);
      setExpandedShops(newSet);
    } else {
      await fetchProducts(shopId);
      setExpandedShops(new Set(expandedShops).add(shopId));
      setProductSearch((prev) => ({ ...prev, [shopId]: "" }));
    }
  };

  const toggleProductSelect = (shopId, productId) => {
    const key = `${shopId}-${productId}`;
    setSelectedProducts((prev) => {
      const newSelected = { ...prev };
      if (newSelected[key]) {
        delete newSelected[key];
      } else {
        newSelected[key] = { shopId, productId };
      }
      return newSelected;
    });
  };

  const toggleSelectAllForShop = (shopId) => {
    const productsForShop = (shopProducts[shopId] || []).filter((p) =>
      (p.titre || "")
        .toLowerCase()
        .includes((productSearch[shopId] || "").toLowerCase())
    );

    const allSelected = productsForShop.every((prod) => {
      const key = `${shopId}-${prod.productId}`;
      return !!selectedProducts[key];
    });

    setSelectedProducts((prev) => {
      const newSelected = { ...prev };

      if (allSelected) {
        // Deselect all products for this shop
        productsForShop.forEach((prod) => {
          const key = `${shopId}-${prod.productId}`;
          delete newSelected[key];
        });
      } else {
        // Select all products for this shop
        productsForShop.forEach((prod) => {
          const key = `${shopId}-${prod.productId}`;
          newSelected[key] = { shopId, productId: prod.productId };
        });
      }

      return newSelected;
    });
  };

  const promptApiKeys = (shop) => {
    setModal({
      open: true,
      type: "confirmation",
      title: "Ajouter les clés API",
      message: (
        <div className="space-y-4 text-sm">
          <p>
            Cette boutique n'a pas encore de clés API Shopify enregistrées.
            Suivez les étapes ci-dessous pour créer une{" "}
            <strong>application personnalisée</strong> et récupérer les clés :
          </p>
          <div className="bg-gray-50 border p-3 rounded">
            <ol className="list-decimal ml-5 space-y-1">
              <li>
                Connectez-vous à l'Admin de la boutique : <br />
                <a
                  href={`https://${
                    shop.shopifyDomain || shop.myshopify_domain
                  }.myshopify.com/admin/apps`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {shop.shopifyDomain || shop.myshopify_domain}
                  .myshopify.com/admin
                </a>
              </li>
              <li>Menu « Apps » → « Develop apps » → « Create an app »</li>
              <li>Donnez-lui un nom (« SNA-Connector » par ex.) et créez</li>
              <li>
                Onglet « Configuration » → « Admin API integration » : activez
                *toutes* les autorisations ou au minimum « Products » (read &
                write), puis « Save »
              </li>
              <li>
                Revenez à l'onglet « API credentials » puis « Install app » et
                confirmez
              </li>
              <li>
                Copiez les champs « API key », « API secret key » et « Access
                token » affichés
              </li>
            </ol>
          </div>
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-medium">API key</label>
            <input
              id="api-key-input"
              className="w-full border p-2 text-xs"
              placeholder="ex: 3d2f0d6a0e..."
            />
            <label className="block text-xs font-medium">API secret key</label>
            <input
              id="api-secret-input"
              className="w-full border p-2 text-xs"
              placeholder="ex: shpss_..."
            />
            <label className="block text-xs font-medium">API token</label>
            <input
              id="api-token-input"
              className="w-full border p-2 text-xs"
              placeholder="ex: shpat_..."
            />
          </div>
        </div>
      ),
      onConfirm: async () => {
        const apiKey = document.getElementById("api-key-input").value.trim();
        const apiSecret = document
          .getElementById("api-secret-input")
          .value.trim();
        const apiToken = document
          .getElementById("api-token-input")
          .value.trim();
        if (!apiKey || !apiSecret || !apiToken)
          return alert("Veuillez remplir les trois champs");

        try {
          const res = await fetch(
            `/api/internal/clients/${shop.clientId}/shops/${shop.shopId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                shopifyConfig: {
                  apiKey,
                  apiSecret,
                  accessToken: apiToken,
                },
              }),
            }
          );
          if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
          // refresh shops list to include new keys
          await loadShops();
          setNotification({
            type: "success",
            message: "Clés API enregistrées – génération en cours...",
          });
          setModal({ open: false });
          // relaunch publication
          await publishSelected();
        } catch (err) {
          alert(err.message);
        }
      },
      onClose: () => setModal({ open: false }),
    });
  };

  const publishSelected = async () => {
    if (Object.keys(selectedProducts).length === 0) {
      setNotification({
        type: "error",
        message: "Veuillez sélectionner au moins un produit.",
      });
      return;
    }

    // Vérifier les boutiques sélectionnées
    const shopIds = [
      ...new Set(Object.values(selectedProducts).map((p) => p.shopId)),
    ];
    if (shopIds.length === 0) {
      setNotification({
        type: "error",
        message: "Aucune boutique trouvée pour les produits sélectionnés.",
      });
      return;
    }

    const grouped = {};
    Object.values(selectedProducts).forEach(({ shopId, productId }) => {
      if (!grouped[shopId]) grouped[shopId] = [];
      grouped[shopId].push(productId);
    });

    // Vérifier si toutes les boutiques ont les clés API nécessaires
    const shopWithoutKeys = shops.find((s) => {
      if (!grouped[s.shopId]) return false;

      const config = s.shopifyConfig || {};
      const apiKey = config.apiKey || s.apiKey || s["shopifyConfig.apiKey"];
      const apiSecret =
        config.apiSecret || s.apiSecret || s["shopifyConfig.apiSecret"];
      const accessToken =
        config.accessToken || s.accessToken || s["shopifyConfig.accessToken"];

      return !apiKey || !apiSecret || !accessToken;
    });

    if (shopWithoutKeys) {
      promptApiKeys(shopWithoutKeys);
      return;
    }

    setIsPublishing(true);
    try {
      for (const shopId of Object.keys(grouped)) {
        const shop = shops.find((s) => s.shopId === shopId);
        if (!shop) continue;

        const productIds = grouped[shopId];
        console.log(
          `[Frontend] Publishing ${productIds.length} products for shop ${shop.customerName}`
        );

        const res = await fetch(
          `/api/internal/shopify/shop/${shopId}/publish-products`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds }),
          }
        );

        const data = await res.json();
        console.log(`[Frontend] Publication response:`, data);

        if (data.success) {
          setNotification({
            type: "success",
            message: `${data.message || "Produits publiés avec succès"} (${
              data.successCount
            }/${data.totalProcessed})`,
          });

          // Log detailed results
          if (data.results) {
            data.results.forEach((result) => {
              if (result.success) {
                console.log(
                  `✅ ${result.title}: Created with ID ${result.shopifyProductId}`
                );
              } else {
                console.error(`❌ ${result.title}: ${result.error}`);
              }
            });
          }
        } else {
          const errorMsg =
            data.error || data.details || "Erreur lors de la publication";

          // Check if error is about missing domain configuration
          if (
            errorMsg.includes("No Shopify domain configured") ||
            errorMsg.includes("domain")
          ) {
            const shop = shops.find((s) => s.shopId === shopId);
            if (shop) {
              setShopNeedingDomain(shop);
              setIsDomainModalOpen(true);
              return; // Don't show general error notification
            }
          }

          setNotification({
            type: "error",
            message: `Échec de publication: ${errorMsg}`,
          });

          // Log failed products if available
          if (data.results) {
            data.results
              .filter((r) => !r.success)
              .forEach((result) => {
                console.error(`❌ ${result.title}: ${result.error}`);
              });
          }
        }
      }

      // Refresh products to show updated hasShopify status
      const refreshPromises = Object.keys(grouped).map((shopId) =>
        fetchProducts(shopId)
      );
      await Promise.all(refreshPromises);

      setSelectedProducts({});
    } catch (err) {
      setNotification({
        type: "error",
        message: "Erreur lors de la publication: " + err.message,
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const formatPrice = (price) => {
    if (!price) return null;
    const numPrice = parseFloat(price);
    return !isNaN(numPrice) ? numPrice.toFixed(2) : null;
  };

  // Helper to safely convert any value to a string for rendering
  const formatChild = (value) => {
    if (value == null) return null;
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      // For plain objects, list truthy keys
      const keys = Object.keys(value).filter((k) => {
        const v = value[k];
        return typeof v === "boolean" ? v : v != null;
      });
      return keys.join(", ") || JSON.stringify(value);
    }
    return String(value);
  };

  const renderProductDetails = (prod) => {
    // Price fallback
    const rawPrice = prod.prix != null ? prod.prix : prod.price;
    // EAN fallback
    const eans = prod.eans || {};
    const skus = prod.skus || {};
    const eanValues = Object.values(eans).filter(Boolean);
    const skuValues = Object.values(skus).filter(Boolean);

    // Total stock calculation
    let totalStock = null;
    if (prod.stock != null) {
      if (typeof prod.stock === "object") {
        totalStock = Object.values(prod.stock).reduce(
          (sum, v) => sum + (typeof v === "number" ? v : 0),
          0
        );
      } else {
        totalStock = prod.stock;
      }
    }

    // Get sizes and colors
    const sizes = prod.tailles || prod.sizes || [];
    const colors = prod.couleurs || prod.colors || [];

    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          {prod.categories && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              <FaTags className="mr-1" />
              {formatChild(prod.categories)}
            </span>
          )}
          {formatPrice(rawPrice) && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {formatPrice(rawPrice)} €
            </span>
          )}
          {totalStock != null && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <FaBox className="mr-1" />
              Stock: {totalStock}
            </span>
          )}
          {prod.hasShopify && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <FaShoppingCart className="mr-1" />
              Ce produit a déjà une fiche Shopify
            </span>
          )}
          {eanValues.length > 0 && (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
              title={eanValues.join(", ")}
            >
              <FaBarcode className="mr-1" />
              {`EANs (${eanValues.length})`}
            </span>
          )}
          {skuValues.length > 0 && (
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              title={skuValues.join(", ")}
            >
              <FaTags className="mr-1" />
              {`SKUs (${skuValues.length})`}
            </span>
          )}
        </div>

        {/* Display sizes and colors if available */}
        {(sizes.length > 0 || colors.length > 0) && (
          <div className="mt-2 p-2 bg-gray-50 rounded">
            <div className="text-xs text-gray-600 space-y-1">
              {sizes.length > 0 && (
                <div>
                  <span className="font-medium">Tailles:</span>{" "}
                  {sizes.join(", ")}
                </div>
              )}
              {colors.length > 0 && (
                <div>
                  <span className="font-medium">Couleurs:</span>{" "}
                  {colors.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
        {prod.caracteristiques && (
          <div className="mt-2">
            <h5 className="text-sm font-medium text-gray-700 mb-1">
              Caractéristiques:
            </h5>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(prod.caracteristiques).map(([key, value]) => {
                let displayValue;
                if (value && typeof value === "object") {
                  if (Array.isArray(value)) displayValue = value.join(", ");
                  else
                    displayValue = Object.keys(value)
                      .filter((k) => value[k])
                      .join(", ");
                } else displayValue = value;
                return (
                  <div
                    key={key}
                    className="text-xs text-gray-600 bg-gray-50 rounded p-2"
                  >
                    <span className="font-medium">{key}:</span>{" "}
                    {formatChild(displayValue)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Helper to update local shopProducts state for immediate UI feedback
  const updateProductLocalStatus = (shopId, productId, newStatus) => {
    setShopProducts((prev) => {
      const updated = { ...prev };
      if (!updated[shopId]) return prev;
      updated[shopId] = updated[shopId].map((p) =>
        p.productId === productId ? { ...p, hasShopify: newStatus } : p
      );
      return updated;
    });
  };

  // Handler to disassociate Shopify from a shop
  const disassociateShopify = async (shop) => {
    try {
      await fetch(
        `/api/internal/clients/${shop.clientId}/shops/${shop.shopId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ hasShopify: false }),
        }
      );
      // Refresh list
      loadShops();
    } catch (err) {
      console.error("Error disassociating Shopify:", err);
    }
  };

  // Function to save domain from admin URL
  const saveDomain = async () => {
    if (!adminUrl.trim()) {
      setNotification({
        type: "error",
        message: "Veuillez entrer l'URL d'administration",
      });
      return;
    }

    setIsSavingDomain(true);
    try {
      const response = await fetch(
        `/api/internal/shops/${shopNeedingDomain.shopId}/save-domain`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            adminUrl: adminUrl.trim(),
            shopifyDomain: extractDomainFromUrl(adminUrl.trim()),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.message || "Erreur lors de la sauvegarde du domaine"
        );
      }

      setNotification({
        type: "success",
        message:
          "Domaine sauvegardé avec succès! Vous pouvez maintenant relancer la génération.",
      });

      setIsDomainModalOpen(false);
      setShopNeedingDomain(null);
      setAdminUrl("");

      // Refresh shops to get updated domain
      await loadShops();
    } catch (error) {
      setNotification({
        type: "error",
        message: `Erreur: ${error.message}`,
      });
    } finally {
      setIsSavingDomain(false);
    }
  };

  // Helper function to extract domain from admin URL
  const extractDomainFromUrl = (url) => {
    try {
      // Handle URLs like https://shop-name.myshopify.com/admin
      // or https://admin.shopify.com/store/shop-name
      const urlObj = new URL(url);

      if (urlObj.hostname.includes(".myshopify.com")) {
        return urlObj.hostname.replace(".myshopify.com", "");
      } else if (urlObj.hostname === "admin.shopify.com") {
        const pathParts = urlObj.pathname.split("/");
        const storeIndex = pathParts.indexOf("store");
        if (storeIndex !== -1 && pathParts[storeIndex + 1]) {
          return pathParts[storeIndex + 1];
        }
      }

      return urlObj.hostname;
    } catch (error) {
      console.error("Error extracting domain:", error);
      return url;
    }
  };

  // Insert handler for product-level Shopify disassociation
  const disassociateProduct = async (shop, prod) => {
    try {
      const { clientId, shopId } = shop;
      const { productId } = prod;
      const res = await fetch(
        `/api/internal/products/${clientId}/${shopId}/${productId}/set-shopify-status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ hasShopify: false }),
        }
      );
      if (!res.ok) throw new Error("Erreur lors de la mise à jour du produit");
      // Optimistically update local state
      updateProductLocalStatus(shopId, productId, false);
    } catch (err) {
      console.error("Error disassociating Shopify from product:", err);
      setNotification({ type: "error", message: err.message });
    }
  };

  // Handler to mark a product as having a Shopify fiche
  const associateProduct = async (shop, prod) => {
    try {
      const { clientId, shopId } = shop;
      const { productId } = prod;
      const res = await fetch(
        `/api/internal/products/${clientId}/${shopId}/${productId}/set-shopify-status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ hasShopify: true }),
        }
      );
      if (!res.ok) throw new Error("Erreur lors de la mise à jour du produit");
      // Optimistically update local state
      updateProductLocalStatus(shopId, productId, true);
    } catch (err) {
      console.error("Error associating Shopify to product:", err);
      setNotification({ type: "error", message: err.message });
    }
  };

  const filteredShops = shops
    .filter((s) =>
      (s.nomProjet || "").toLowerCase().includes(shopSearch.toLowerCase())
    )
    // Only include shops with at least one documented product
    .filter((s) => shopProducts[s.shopId]?.length > 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Fiches produits Shopify</h1>
        <div className="relative w-64">
          <input
            type="text"
            placeholder="Rechercher une boutique..."
            className="pl-10 pr-4 py-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-sna-primary/50"
            value={shopSearch}
            onChange={(e) => setShopSearch(e.target.value)}
          />
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {notification && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {notification.message}
        </div>
      )}

      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg flex items-start space-x-3">
        <FaInfoCircle className="text-blue-500 mt-1 flex-shrink-0" />
        <p className="text-sm text-blue-700">
          Seules les boutiques avec au moins un produit documenté sont listées.
          Dans chaque boutique, seuls les produits déjà documentés apparaissent.
        </p>
      </div>

      <button
        disabled={isPublishing || Object.keys(selectedProducts).length === 0}
        onClick={publishSelected}
        className={`mb-4 px-6 py-2 rounded-lg text-white font-medium transition-colors ${
          isPublishing || Object.keys(selectedProducts).length === 0
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-sna-primary hover:bg-sna-primary/90"
        }`}
      >
        Publier les produits sélectionnés (
        {Object.keys(selectedProducts).length})
      </button>

      <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
        {filteredShops.map((shop) => (
          <div key={shop.shopId} className="p-4">
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => toggleShop(shop.shopId)}
            >
              <div>
                <h3 className="font-medium text-sna-primary">
                  {shop.nomProjet}
                </h3>
                <p className="text-sm text-gray-500">
                  Client : {shop.customerName}
                </p>
                {shop.myshopify_domain && (
                  <p className="text-xs text-gray-500 mt-1">
                    Shopify: {shop.myshopify_domain}
                  </p>
                )}
              </div>
              <span className="text-gray-400">
                {expandedShops.has(shop.shopId) ? "▲" : "▼"}
              </span>
            </div>

            {expandedShops.has(shop.shopId) && (
              <div className="mt-4 space-y-4">
                <div className="space-y-3">
                  {/* Search and Select All in same row */}
                  <div className="flex gap-4 items-start">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Rechercher un produit..."
                        className="pl-10 pr-4 py-2 border rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-sna-primary/50"
                        value={productSearch[shop.shopId] || ""}
                        onChange={(e) =>
                          setProductSearch((prev) => ({
                            ...prev,
                            [shop.shopId]: e.target.value,
                          }))
                        }
                      />
                      <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    </div>

                    {/* Select All Checkbox - Top Right */}
                    {(shopProducts[shop.shopId] || []).filter((p) =>
                      (p.titre || "")
                        .toLowerCase()
                        .includes(
                          (productSearch[shop.shopId] || "").toLowerCase()
                        )
                    ).length > 0 && (
                      <div className="flex items-center space-x-2 whitespace-nowrap py-2">
                        <input
                          type="checkbox"
                          id={`select-all-${shop.shopId}`}
                          checked={(shopProducts[shop.shopId] || [])
                            .filter((p) =>
                              (p.titre || "")
                                .toLowerCase()
                                .includes(
                                  (
                                    productSearch[shop.shopId] || ""
                                  ).toLowerCase()
                                )
                            )
                            .every((prod) => {
                              const key = `${shop.shopId}-${prod.productId}`;
                              return !!selectedProducts[key];
                            })}
                          onChange={() => toggleSelectAllForShop(shop.shopId)}
                          className="h-4 w-4 text-sna-primary focus:ring-sna-primary border-gray-300 rounded"
                        />
                        <label
                          htmlFor={`select-all-${shop.shopId}`}
                          className="text-sm font-medium text-gray-700 cursor-pointer"
                        >
                          Sélectionner tout
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {(shopProducts[shop.shopId] || [])
                    .filter((p) =>
                      (p.titre || "")
                        .toLowerCase()
                        .includes(
                          (productSearch[shop.shopId] || "").toLowerCase()
                        )
                    )
                    .map((prod) => {
                      const key = `${shop.shopId}-${prod.productId}`;
                      const checked = !!selectedProducts[key];
                      return (
                        <div
                          key={prod.productId}
                          className={`relative p-4 rounded-lg flex items-center space-x-4 transition-colors ${
                            prod.hasShopify
                              ? "border border-emerald-500 bg-emerald-50/30"
                              : "border border-gray-200 bg-white"
                          }`}
                        >
                          <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleProductSelect(shop.shopId, prod.productId)
                              }
                              className="h-5 w-5 rounded text-sna-primary focus:ring-sna-primary"
                            />
                            <div className="flex-grow">
                              <h4 className="font-semibold text-gray-800">
                                {prod.titre}
                              </h4>
                              {prod.description && (
                                <p className="text-sm text-gray-500 mt-1">
                                  {formatChild(prod.description)}
                                </p>
                              )}
                              {renderProductDetails(prod)}
                            </div>
                            {prod.hasShopify ? (
                              <button
                                className="absolute top-2 right-2 bg-red-50 border border-red-200 text-red-700 px-2 py-1 text-xs font-medium rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200 transition"
                                onClick={() => disassociateProduct(shop, prod)}
                              >
                                Ce produit n'a pas de fiche produit
                              </button>
                            ) : (
                              <button
                                className="absolute top-2 right-2 bg-emerald-50 border border-emerald-300 text-emerald-700 px-2 py-1 text-xs font-medium rounded hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition"
                                onClick={() => associateProduct(shop, prod)}
                              >
                                Ce produit a déjà une fiche Shopify
                              </button>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  {shopProducts[shop.shopId] &&
                    shopProducts[shop.shopId].length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Aucun produit documenté
                      </p>
                    )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Domain Input Modal */}
      {isDomainModalOpen && shopNeedingDomain && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Configuration du domaine Shopify
              </h3>
              <button
                onClick={() => {
                  setIsDomainModalOpen(false);
                  setShopNeedingDomain(null);
                  setAdminUrl("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FaTimes className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <div className="flex">
                  <FaExclamationTriangle className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">
                      Domaine Shopify manquant
                    </h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Pour générer les fiches produits, nous avons besoin de
                      l'URL d'administration de votre boutique Shopify.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-blue-800 mb-2">
                  Comment trouver votre URL d'administration :
                </h4>
                <ol className="text-sm text-blue-700 space-y-1 list-decimal ml-4">
                  <li>Connectez-vous à votre boutique Shopify</li>
                  <li>
                    Une fois dans l'admin, copiez l'URL complète de votre
                    navigateur
                  </li>
                  <li>
                    L'URL ressemble à :
                    <div className="mt-1 text-xs bg-blue-100 p-2 rounded font-mono">
                      https://your-shop.myshopify.com/admin
                    </div>
                    <div className="text-xs mt-1">ou</div>
                    <div className="mt-1 text-xs bg-blue-100 p-2 rounded font-mono">
                      https://admin.shopify.com/store/your-shop
                    </div>
                  </li>
                </ol>
              </div>

              <div>
                <label
                  htmlFor="adminUrl"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  URL d'administration de la boutique "
                  {shopNeedingDomain.nomProjet ||
                    shopNeedingDomain.customerName}
                  "
                </label>
                <input
                  type="url"
                  id="adminUrl"
                  value={adminUrl}
                  onChange={(e) => setAdminUrl(e.target.value)}
                  placeholder="https://your-shop.myshopify.com/admin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsDomainModalOpen(false);
                  setShopNeedingDomain(null);
                  setAdminUrl("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                disabled={isSavingDomain}
              >
                Annuler
              </button>
              <button
                onClick={saveDomain}
                disabled={isSavingDomain || !adminUrl.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md flex items-center"
              >
                {isSavingDomain && <FaSpinner className="animate-spin mr-2" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal component */}
      {modal.open && (
        <NotificationModal
          open={modal.open}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={modal.onClose}
          onConfirm={modal.onConfirm}
        />
      )}
    </div>
  );
};

export default FicheProduitsShopify;
