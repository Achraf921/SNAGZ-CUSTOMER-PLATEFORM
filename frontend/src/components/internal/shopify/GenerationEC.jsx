import React, { useEffect, useState } from "react";
import {
  FaInfoCircle,
  FaSearch,
  FaBox,
  FaBarcode,
  FaTags,
} from "react-icons/fa";

const GenerationEC = () => {
  const [shops, setShops] = useState([]);
  const [expandedShops, setExpandedShops] = useState(new Set());
  const [shopProducts, setShopProducts] = useState({});
  const [selectedProducts, setSelectedProducts] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState(null);
  const [shopSearch, setShopSearch] = useState("");
  const [productSearch, setProductSearch] = useState({});

  // Fetch shops on mount (documented + hasShopify)
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const res = await fetch("/api/customer/all?details=true", {
          headers: { "Cache-Control": "no-cache" },
          credentials: "include",
        });
        const data = await res.json();
        const collected = [];
        (data.customers || []).forEach((c) => {
          (c.shops || []).forEach((s) => {
            const documented =
              s.documented === true || s.documented === "documented";
            if (documented && (s.hasShopify || s.shopifyConfigured)) {
              collected.push({ ...s, customerName: c.raisonSociale });
            }
          });
        });
        setShops(collected);
      } catch (err) {
        console.error(err);
      }
    };
    fetchShops();
  }, []);

  const fetchProducts = async (shopId) => {
    if (shopProducts[shopId]) return;
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
    setSelectedProducts((prev) => {
      const key = `${shopId}-${productId}`;
      const copy = { ...prev };
      if (copy[key]) delete copy[key];
      else copy[key] = { shopId, productId };
      return copy;
    });
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
      return Object.keys(val)
        .filter((k) => (typeof val[k] === "boolean" ? val[k] : val[k] != null))
        .join(", ");
    }
    return String(val);
  };

  const renderProductDetails = (prod) => {
    const rawPrice = prod.prix ?? prod.price;
    const rawEan = prod.codeEAN ?? prod.ean;
    let totalStock = null;
    if (prod.stock != null) {
      if (typeof prod.stock === "object") {
        totalStock = Object.values(prod.stock).reduce(
          (sum, v) => sum + (typeof v === "number" ? v : 0),
          0
        );
      } else totalStock = prod.stock;
    }

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
              <FaBox className="mr-1" /> Stock: {totalStock}
            </span>
          )}
          {rawEan && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              <FaBarcode className="mr-1" /> EAN: {formatChild(rawEan)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const generateEC = async () => {
    const grouped = {};
    Object.values(selectedProducts).forEach(({ shopId, productId }) => {
      if (!grouped[shopId]) grouped[shopId] = [];
      grouped[shopId].push(productId);
    });
    if (Object.keys(grouped).length === 0) return;

    setIsGenerating(true);
    try {
      for (const shopId of Object.keys(grouped)) {
        const res = await fetch(
          `/api/internal/shopify/shop/${shopId}/generate-ec`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: grouped[shopId] }),
          }
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Erreur");
      }
      setNotification({ type: "success", message: "Fichiers EC générés" });
      setSelectedProducts({});
    } catch (err) {
      setNotification({ type: "error", message: err.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredShops = shops
    .filter((s) =>
      (s.nomProjet || "").toLowerCase().includes(shopSearch.toLowerCase())
    )
    .filter((s) => shopProducts[s.shopId]?.length > 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Génération d'EC</h1>
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
          Seules les boutiques <strong>documentées</strong> et disposant d'une
          intégration Shopify sont listées. Dans chaque boutique, seuls les
          produits documentés apparaissent.
        </p>
      </div>

      <button
        disabled={isGenerating || Object.keys(selectedProducts).length === 0}
        onClick={generateEC}
        className={`mb-4 px-6 py-2 rounded-lg text-white font-medium transition-colors ${
          isGenerating || Object.keys(selectedProducts).length === 0
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-sna-primary hover:bg-sna-primary/90"
        }`}
      >
        Générer EC ({Object.keys(selectedProducts).length})
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
              </div>
              <span className="text-gray-400">
                {expandedShops.has(shop.shopId) ? "▲" : "▼"}
              </span>
            </div>

            {expandedShops.has(shop.shopId) && (
              <div className="mt-4 space-y-4">
                <div className="relative">
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
                          className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                        >
                          <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                toggleProductSelect(shop.shopId, prod.productId)
                              }
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <h4 className="font-medium">{prod.titre}</h4>
                              {prod.description && (
                                <p className="text-sm text-gray-500 mt-1">
                                  {formatChild(prod.description)}
                                </p>
                              )}
                              {renderProductDetails(prod)}
                            </div>
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
    </div>
  );
};

export default GenerationEC;
