import React, { useEffect, useState } from "react";
import {
  FaInfoCircle,
  FaSearch,
  FaBox,
  FaBarcode,
  FaTags,
  FaShoppingCart,
  FaSpinner,
} from "react-icons/fa";
import NotificationModal from "../../shared/NotificationModal";

const GenerationEC = () => {
  const [shops, setShops] = useState([]);
  const [expandedShops, setExpandedShops] = useState(new Set());
  const [shopProducts, setShopProducts] = useState({});
  const [selectedProducts, setSelectedProducts] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState(null);
  const [shopSearch, setShopSearch] = useState("");
  const [productSearch, setProductSearch] = useState({});
  const [modal, setModal] = useState({ open: false });
  const [showAllProducts, setShowAllProducts] = useState(false);

  // Load shops and products - keeping the existing logic for EC generation (products with hasShopify: true)
  const loadShops = async () => {
    try {
      const res = await fetch("/api/internal/all?details=true", {
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to fetch shop data");

      const collectedShops = [];
      (data.customers || []).forEach((c) => {
        (c.shops || []).forEach((s) => {
          const isDocumented =
            s.documented === true || s.documented === "documented";
          const hasShopifyAccess = s.hasShopify || s.shopifyConfigured;
          if (isDocumented && hasShopifyAccess) {
            collectedShops.push({
              ...s,
              customerName: c.raisonSociale,
              clientId: c._id?.toString() || c.id,
            });
          }
        });
      });

      setShops(collectedShops);

      // Preload products with hasShopify: true for EC generation
      const productsMap = {};
      await Promise.all(
        collectedShops.map(async (s) => {
          try {
            const productRes = await fetch(
              `/api/customer/shop/${s.shopId}/products`
            );
            const productData = await productRes.json();
            // Filter for products that are PUBLISHED to Shopify
            productsMap[s.shopId] = (productData.products || []).filter(
              (p) => p.hasShopify === true
            );
          } catch (e) {
            console.error(`Failed to load products for shop ${s.shopId}`, e);
            productsMap[s.shopId] = [];
          }
        })
      );

      setShopProducts(productsMap);
    } catch (err) {
      console.error("Error loading shops for EC generation:", err);
      setNotification({
        type: "error",
        message: "Impossible de charger les boutiques.",
      });
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  const fetchProducts = async (shopId) => {
    if (shopProducts[shopId]) return; // already loaded
    try {
      const productRes = await fetch(`/api/customer/shop/${shopId}/products`);
      const productData = await productRes.json();
      const products = (productData.products || []).filter(
        (p) => p.hasShopify === true
      );
      setShopProducts((prev) => ({ ...prev, [shopId]: products }));
    } catch (e) {
      console.error(`Failed to load products for shop ${shopId}`, e);
    }
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
    // Find the product to check if it has EC
    const product = shopProducts[shopId]?.find(
      (p) => p.productId === productId
    );
    if (product?.hasEC) {
      setNotification({
        type: "error",
        message:
          "Impossible de sélectionner un produit qui a déjà un EC généré.",
      });
      return;
    }

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
    const productsForShop = (shopProducts[shopId] || [])
      .filter((p) =>
        (p.titre || "")
          .toLowerCase()
          .includes((productSearch[shopId] || "").toLowerCase())
      )
      .filter((p) => !p.hasEC); // Only include products without EC for selection

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

  const generateEC = async () => {
    const productsToGenerate = Object.values(selectedProducts);
    if (productsToGenerate.length === 0) {
      setNotification({
        type: "error",
        message: "Veuillez sélectionner au moins un produit.",
      });
      return;
    }

    const shopId = productsToGenerate[0].shopId;
    const productIds = productsToGenerate.map((p) => p.productId);

    setIsGenerating(true);
    setNotification(null);
    try {
      const res = await fetch(`/api/internal/ec/shop/${shopId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.message || "La génération du fichier EC a échoué."
        );
      }
      setModal({
        open: true,
        type: "success",
        title: "Génération réussie",
        message:
          "Le fichier EC a été généré et est disponible dans les téléchargements.",
        onClose: () => setModal({ open: false }),
      });

      // Mark generated products as having EC and remove them from the list
      productsToGenerate.forEach(({ shopId, productId }) => {
        updateProductLocalStatus(shopId, productId, true);
        setShopProducts((prev) => {
          const updated = { ...prev };
          if (updated[shopId]) {
            updated[shopId] = updated[shopId].filter(
              (p) => p.productId !== productId
            );
          }
          return updated;
        });
      });

      setSelectedProducts({});
    } catch (err) {
      setModal({
        open: true,
        type: "error",
        title: "Erreur de Génération",
        message: err.message,
        onClose: () => setModal({ open: false }),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const formatPrice = (price) => {
    if (price == null) return null;
    const n = parseFloat(price);
    return isNaN(n) ? null : n.toFixed(2);
  };

  const formatChild = (val) => {
    if (val == null) return null;
    if (typeof val === "object") {
      if (Array.isArray(val)) return val.join(", ");
      return Object.keys(val).join(", ");
    }
    return String(val);
  };

  // Helper to update local shopProducts state for immediate UI feedback
  const updateProductLocalStatus = (shopId, productId, newStatus) => {
    setShopProducts((prev) => {
      const updated = { ...prev };
      if (!updated[shopId]) return prev;
      updated[shopId] = updated[shopId].map((p) =>
        p.productId === productId ? { ...p, hasEC: newStatus } : p
      );
      return updated;
    });
  };

  // Handler to mark a product as having an EC or remove EC status
  const toggleECStatus = async (shop, prod, newStatus) => {
    try {
      const { clientId, shopId } = shop;
      const { productId } = prod;
      const res = await fetch(
        `/api/internal/products/${clientId}/${shopId}/${productId}/set-ec-status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ hasEC: newStatus }),
        }
      );
      if (!res.ok) throw new Error("Erreur lors de la mise à jour du produit");
      // Optimistically update local state
      updateProductLocalStatus(shopId, productId, newStatus);

      // If we're removing EC status (setting to false), remove from selection and add back to list
      if (!newStatus) {
        const key = `${shopId}-${productId}`;
        setSelectedProducts((prev) => {
          const newSelected = { ...prev };
          delete newSelected[key];
          return newSelected;
        });
      } else {
        // If setting EC to true, remove from the list
        setShopProducts((prev) => {
          const updated = { ...prev };
          if (updated[shopId]) {
            updated[shopId] = updated[shopId].filter(
              (p) => p.productId !== productId
            );
          }
          return updated;
        });
      }
    } catch (err) {
      console.error("Error updating EC status:", err);
      setNotification({ type: "error", message: err.message });
    }
  };

  const renderProductDetails = (prod) => {
    const rawPrice = prod.prix ?? prod.price;
    const eans = prod.eans || {};
    const skus = prod.skus || {};
    const eanValues = Object.values(eans).filter(Boolean);
    const skuValues = Object.values(skus).filter(Boolean);

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
              Publié sur Shopify
            </span>
          )}
          {prod.hasEC && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              EC Généré
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

  const filteredShops = shops
    .filter((s) =>
      (s.nomProjet || "").toLowerCase().includes(shopSearch.toLowerCase())
    )
    // Only include shops with at least one published product
    .filter((s) => shopProducts[s.shopId]?.length > 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Génération d'EC</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAllProducts}
              onChange={(e) => setShowAllProducts(e.target.checked)}
              className="h-4 w-4 text-sna-primary focus:ring-sna-primary border-gray-300 rounded"
            />
            <span>Afficher tous les produits (avec EC)</span>
          </label>
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
          Cette page liste les boutiques <strong>documentées</strong> ayant des
          produits déjà <strong>publiés sur Shopify</strong> mais qui
          <strong> n'ont pas encore d'EC généré</strong>. Utilisez cette
          interface pour générer les fichiers EC correspondants.
        </p>
      </div>

      <button
        disabled={isGenerating || Object.keys(selectedProducts).length === 0}
        onClick={generateEC}
        className={`mb-4 px-6 py-2 rounded-lg text-white font-medium transition-colors flex items-center gap-2 ${
          isGenerating || Object.keys(selectedProducts).length === 0
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-sna-primary hover:bg-sna-primary/90"
        }`}
      >
        {isGenerating ? (
          <>
            <FaSpinner className="animate-spin" />
            Génération en cours...
          </>
        ) : (
          <>Générer EC pour {Object.keys(selectedProducts).length} produit(s)</>
        )}
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
                    {(shopProducts[shop.shopId] || [])
                      .filter((p) =>
                        (p.titre || "")
                          .toLowerCase()
                          .includes(
                            (productSearch[shop.shopId] || "").toLowerCase()
                          )
                      )
                      .filter((p) => !p.hasEC).length > 0 && (
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
                            .filter((p) => !p.hasEC)
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
                    .filter((p) => showAllProducts || !p.hasEC) // Show all or only without EC
                    .map((prod) => {
                      const key = `${shop.shopId}-${prod.productId}`;
                      const checked = !!selectedProducts[key];
                      return (
                        <div
                          key={prod.productId}
                          className={`relative p-4 rounded-lg flex items-center space-x-4 transition-colors ${
                            prod.hasEC
                              ? "border border-purple-500 bg-purple-50/30"
                              : "border border-emerald-500 bg-emerald-50/30"
                          }`}
                        >
                          <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleProductSelect(shop.shopId, prod.productId)
                              }
                              disabled={prod.hasEC}
                              className="h-5 w-5 rounded text-sna-primary focus:ring-sna-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
                            {prod.hasEC ? (
                              <button
                                className="absolute top-2 right-2 bg-red-50 border border-red-200 text-red-700 px-2 py-1 text-xs font-medium rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200 transition"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleECStatus(shop, prod, false);
                                }}
                              >
                                Ce produit n'a pas d'EC
                              </button>
                            ) : (
                              <button
                                className="absolute top-2 right-2 bg-emerald-50 border border-emerald-300 text-emerald-700 px-2 py-1 text-xs font-medium rounded hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleECStatus(shop, prod, true);
                                }}
                              >
                                Ce produit a déjà un EC
                              </button>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  {shopProducts[shop.shopId] &&
                    shopProducts[shop.shopId].length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Aucun produit sans EC disponible pour cette boutique
                      </p>
                    )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

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

export default GenerationEC;
