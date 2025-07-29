import React, { useEffect, useState } from "react";
import {
  FaInfoCircle,
  FaSearch,
  FaBox,
  FaBarcode,
  FaTags,
  FaShoppingCart,
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

  // Re-implementing the proven data fetching logic from FicheProduitsShopify
  useEffect(() => {
    const loadShopsAndProducts = async () => {
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

        const productsMap = {};
        await Promise.all(
          collectedShops.map(async (s) => {
            try {
              const productRes = await fetch(
                `/api/customer/shop/${s.shopId}/products`
              );
              const productData = await productRes.json();
              // Filter for products that are PUBLISHED to Shopify for this page
              productsMap[s.shopId] = (productData.products || []).filter(
                (p) => p.hasShopify === true
              );
            } catch (e) {
              console.error(`Failed to load products for shop ${s.shopId}`, e);
              productsMap[s.shopId] = [];
            }
          })
        );

        // Only include shops that have at least one product with hasShopify: true
        const finalShops = collectedShops.filter(
          (s) => productsMap[s.shopId] && productsMap[s.shopId].length > 0
        );

        setShops(finalShops);
        setShopProducts(productsMap);
      } catch (err) {
        console.error("Error loading shops for EC generation:", err);
        setNotification({
          type: "error",
          message: "Impossible de charger les boutiques.",
        });
      }
    };

    loadShopsAndProducts();
  }, []);

  const toggleShop = (shopId) => {
    const newSet = new Set(expandedShops);
    if (newSet.has(shopId)) {
      newSet.delete(shopId);
    } else {
      newSet.add(shopId);
      if (!productSearch[shopId]) {
        setProductSearch((prev) => ({ ...prev, [shopId]: "" }));
      }
    }
    setExpandedShops(newSet);
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

    const allSelected = productsForShop.every(
      (prod) => selectedProducts[`${shopId}-${prod.productId}`]
    );

    setSelectedProducts((prev) => {
      const newSelected = { ...prev };
      if (allSelected) {
        productsForShop.forEach(
          (prod) => delete newSelected[`${shopId}-${prod.productId}`]
        );
      } else {
        productsForShop.forEach((prod) => {
          newSelected[`${shopId}-${prod.productId}`] = {
            shopId,
            productId: prod.productId,
          };
        });
      }
      return newSelected;
    });
  };

  const generateEC = async () => {
    const productsToGenerate = Object.values(selectedProducts);
    if (productsToGenerate.length === 0) return;

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

    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          {prod.categories && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              <FaTags className="mr-1" /> {formatChild(prod.categories)}
            </span>
          )}
          {formatPrice(rawPrice) && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {formatPrice(rawPrice)} €
            </span>
          )}
          {totalStock != null && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <FaBox className="mr-1" /> Stock: {totalStock}
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
      </div>
    );
  };

  const filteredShops = shops.filter((s) =>
    (s.nomProjet || "").toLowerCase().includes(shopSearch.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <NotificationModal {...modal} />
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Génération d'EC</h1>
          <div className="relative w-72">
            <input
              type="text"
              placeholder="Rechercher une boutique..."
              className="pl-10 pr-4 py-2 border rounded-full w-full focus:outline-none focus:ring-2 focus:ring-sna-primary"
              value={shopSearch}
              onChange={(e) => setShopSearch(e.target.value)}
            />
            <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {notification && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-center shadow-sm ${
              notification.type === "success"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {notification.message}
          </div>
        )}

        <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 rounded-r-lg mb-6 flex items-start">
          <FaInfoCircle className="h-5 w-5 mr-3 mt-0.5" />
          <p className="text-sm">
            Cette page liste les boutiques <strong>documentées</strong> ayant
            des produits déjà <strong>publiés sur Shopify</strong>. Utilisez
            cette interface pour générer les fichiers EC correspondants.
          </p>
        </div>

        <div className="flex justify-start mb-6">
          <button
            disabled={
              isGenerating || Object.keys(selectedProducts).length === 0
            }
            onClick={generateEC}
            className={`px-6 py-2.5 rounded-lg text-white font-semibold transition-all duration-200 flex items-center shadow-md ${
              isGenerating || Object.keys(selectedProducts).length === 0
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-sna-primary hover:bg-sna-primary-dark"
            }`}
          >
            <FaShoppingCart className="mr-2" />
            Générer EC pour {Object.keys(selectedProducts).length} produit(s)
          </button>
        </div>

        <div className="space-y-4">
          {filteredShops.map((shop) => (
            <div
              key={shop.shopId}
              className="bg-white rounded-xl shadow-md overflow-hidden transition-all duration-300"
            >
              <div
                className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                onClick={() => toggleShop(shop.shopId)}
              >
                <div>
                  <h3 className="font-semibold text-lg text-sna-primary">
                    {shop.nomProjet}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Client : {shop.customerName}
                  </p>
                </div>
                <span className="text-gray-400 text-xl">
                  {expandedShops.has(shop.shopId) ? "▲" : "▼"}
                </span>
              </div>

              {expandedShops.has(shop.shopId) && (
                <div className="p-5 border-t border-gray-200 bg-gray-50">
                  <div className="flex justify-between items-center mb-4">
                    <div className="relative w-full max-w-md">
                      <input
                        type="text"
                        placeholder="Rechercher un produit par nom..."
                        className="pl-10 pr-4 py-2 border rounded-full w-full text-sm focus:outline-none focus:ring-2 focus:ring-sna-primary"
                        value={productSearch[shop.shopId] || ""}
                        onChange={(e) =>
                          setProductSearch((prev) => ({
                            ...prev,
                            [shop.shopId]: e.target.value,
                          }))
                        }
                      />
                      <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    </div>
                    <button
                      onClick={() => toggleSelectAllForShop(shop.shopId)}
                      className="text-sm font-medium text-sna-primary hover:underline"
                    >
                      Tout sélectionner/désélectionner
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(shopProducts[shop.shopId] || [])
                      .filter((p) =>
                        (p.titre || "")
                          .toLowerCase()
                          .includes(
                            (productSearch[shop.shopId] || "").toLowerCase()
                          )
                      )
                      .map((prod) => (
                        <div
                          key={prod.productId}
                          className="bg-white p-4 rounded-lg border border-gray-200 flex items-center space-x-4"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded text-sna-primary focus:ring-sna-primary"
                            checked={
                              !!selectedProducts[
                                `${shop.shopId}-${prod.productId}`
                              ]
                            }
                            onChange={() =>
                              toggleProductSelect(shop.shopId, prod.productId)
                            }
                          />
                          <div className="flex-grow">
                            <p className="font-semibold text-gray-800">
                              {prod.titre}
                            </p>
                            {renderProductDetails(prod)}
                          </div>
                          {prod.hasShopify && (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Publié
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GenerationEC;
