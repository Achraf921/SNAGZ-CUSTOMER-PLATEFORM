import React, { useState, useEffect } from "react";
import {
  FaStore,
  FaShoppingBag,
  FaEdit,
  FaPlus,
  FaExclamationTriangle,
  FaCheckCircle,
} from "react-icons/fa";

const MesProduits = () => {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState(null);

  const availableSizes = ["XS", "S", "M", "L", "XL"];
  const availableColors = [
    "Rouge",
    "Bleu",
    "Vert",
    "Noir",
    "Blanc",
    "Jaune",
    "Rose",
    "Violet",
    "Orange",
    "Gris",
  ];

  // Get user ID from storage
  useEffect(() => {
    let userInfoStr =
      sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
    let sub = null;

    try {
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        sub = userInfo.sub;
        setUserId(sub);
      }
    } catch (error) {
      console.error("Error parsing userInfo:", error);
      setError(
        "Erreur lors de la récupération des informations utilisateur. Veuillez vous reconnecter."
      );
    }

    if (!sub) {
      const fallbackUserId =
        sessionStorage.getItem("userId") || localStorage.getItem("userId");
      if (fallbackUserId) {
        setUserId(fallbackUserId);
      } else {
        setError(
          "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
        );
        setLoading(false);
      }
    }
  }, []);

  // Fetch user's shops
  useEffect(() => {
    const fetchShops = async () => {
      if (!userId) return;

      try {
        setLoading(true);
        const apiUrl =
          process.env.NODE_ENV === "production"
            ? `/api/customer/shops/${userId}`
            : `http://localhost:5000/api/customer/shops/${userId}`;

        const response = await fetch(apiUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (!response.ok)
          throw new Error("Erreur lors de la récupération des boutiques");

        const data = await response.json();
        // Filter only valid shops
        const validShops = (data.shops || []).filter(
          (shop) => shop.status === "valid"
        );
        setShops(validShops);
      } catch (err) {
        console.error("Error fetching shops:", err);
        setError(
          "Une erreur est survenue lors de la récupération des boutiques"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchShops();
  }, [userId]);

  // Fetch products for selected shop
  const fetchProducts = async (shopId) => {
    if (!userId || !shopId) return;

    try {
      setLoading(true);
      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/customer/shops/${userId}/${shopId}/products`
          : `http://localhost:5000/api/customer/shops/${userId}/${shopId}/products`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok)
        throw new Error("Erreur lors de la récupération des produits");

      const data = await response.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error("Error fetching products:", err);
      setError("Une erreur est survenue lors de la récupération des produits");
    } finally {
      setLoading(false);
    }
  };

  const handleShopSelect = (shop) => {
    setSelectedShop(shop);
    setEditingProduct(null);
    fetchProducts(shop.shopId);
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product.productId);
    setEditForm({
      ...product,
      hasSizes: product.sizes && product.sizes.length > 0,
      hasColors: product.colors && product.colors.length > 0,
      stock: product.stock || {},
    });
  };

  const handleFormChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSizeToggle = (size) => {
    setEditForm((prev) => ({
      ...prev,
      sizes: prev.sizes?.includes(size)
        ? prev.sizes.filter((s) => s !== size)
        : [...(prev.sizes || []), size],
    }));
  };

  const handleColorChange = (e) => {
    const value = e.target.value;
    if (value && !editForm.colors?.includes(value)) {
      setEditForm((prev) => ({
        ...prev,
        colors: [...(prev.colors || []), value],
      }));
    }
  };

  const removeColor = (colorToRemove) => {
    setEditForm((prev) => ({
      ...prev,
      colors: prev.colors?.filter((color) => color !== colorToRemove) || [],
    }));
  };

  // Generate all size/color combinations for stock tracking
  const generateStockCombinations = () => {
    if (!editForm) return [];

    const combinations = [];

    if (editForm.hasSizes && editForm.hasColors) {
      // Both sizes and colors
      (editForm.sizes || []).forEach((size) => {
        (editForm.colors || []).forEach((color) => {
          combinations.push({
            key: `${size}-${color}`,
            label: `${size} - ${color}`,
            size,
            color,
          });
        });
      });
    } else if (editForm.hasSizes && !editForm.hasColors) {
      // Only sizes
      (editForm.sizes || []).forEach((size) => {
        combinations.push({
          key: size,
          label: `Taille ${size}`,
          size,
          color: null,
        });
      });
    } else if (!editForm.hasSizes && editForm.hasColors) {
      // Only colors
      (editForm.colors || []).forEach((color) => {
        combinations.push({
          key: color,
          label: `Couleur ${color}`,
          size: null,
          color,
        });
      });
    } else {
      // No sizes or colors - simple stock
      combinations.push({
        key: "default",
        label: "Stock général",
        size: null,
        color: null,
      });
    }

    return combinations;
  };

  // Handle stock input changes
  const handleStockChange = (combinationKey, value) => {
    const stockValue = value === "" ? "" : Math.max(0, parseInt(value) || 0);
    setEditForm((prev) => ({
      ...prev,
      stock: {
        ...(prev.stock || {}),
        [combinationKey]: stockValue,
      },
    }));
  };

  const handleSaveProduct = async () => {
    if (!selectedShop || !editingProduct) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const productData = {
        ...editForm,
        price: parseFloat(editForm.price),
        weight: editForm.weight ? parseFloat(editForm.weight) : null,
      };

      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${editingProduct}`
          : `http://localhost:5000/api/customer/shops/${userId}/${selectedShop.shopId}/products/${editingProduct}`;

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Erreur lors de la mise à jour du produit"
        );
      }

      // Refresh products list
      await fetchProducts(selectedShop.shopId);
      setEditingProduct(null);
      setEditForm({});
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getShopProductCount = (shop) => {
    return shop.products?.length || 0;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sna-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error && !shops.length) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6">
          <div className="flex items-center">
            <FaExclamationTriangle className="mr-2" />
            <span>{error}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Mes Produits</h1>
        <p className="text-gray-600">
          Gérez tous vos produits par boutique. Sélectionnez une boutique pour
          voir ses produits.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6">
          <div className="flex items-center">
            <FaExclamationTriangle className="mr-2" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Shops List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                Mes Boutiques
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {shops.length === 0 ? (
                <div className="text-center py-8">
                  <FaStore className="mx-auto text-gray-400 text-4xl mb-4" />
                  <p className="text-gray-600">Aucune boutique trouvée</p>
                  <a
                    href="/client/boutiques/create"
                    className="text-sna-primary hover:underline mt-2 inline-block"
                  >
                    Créer ma première boutique
                  </a>
                </div>
              ) : (
                shops.map((shop) => (
                  <div
                    key={shop.shopId}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      selectedShop?.shopId === shop.shopId
                        ? "border-sna-primary bg-sna-primary bg-opacity-5"
                        : "border-gray-200 hover:border-sna-primary hover:bg-gray-50"
                    }`}
                    onClick={() => handleShopSelect(shop)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <FaStore className="text-sna-primary text-lg mr-3" />
                        <div>
                          <h3 className="font-semibold text-gray-800">
                            {shop.nomProjet || shop.name || "Boutique"}
                          </h3>
                          <div className="flex items-center space-x-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                shop.status === "valid"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {shop.status === "valid"
                                ? "Validée"
                                : "En attente"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {getShopProductCount(shop)} produit(s)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Products List */}
        <div className="lg:col-span-2">
          {!selectedShop ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <FaShoppingBag className="mx-auto text-gray-400 text-6xl mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-3">
                Sélectionnez une boutique
              </h3>
              <p className="text-gray-600">
                Choisissez une boutique dans la liste de gauche pour voir ses
                produits.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <FaStore className="text-sna-primary text-xl mr-3" />
                    <div>
                      <h2 className="text-lg font-semibold text-gray-800">
                        {selectedShop.nomProjet || selectedShop.name}
                      </h2>
                      <span className="text-sm text-gray-600">
                        {products.length} produit(s)
                      </span>
                    </div>
                  </div>
                  <a
                    href={`/client/produits/create?shopId=${selectedShop.shopId}`}
                    className="bg-sna-primary text-white px-4 py-2 rounded-md hover:bg-sna-primary-dark transition duration-300 flex items-center"
                  >
                    <FaPlus className="mr-2" />
                    Ajouter un produit
                  </a>
                </div>
              </div>

              <div className="p-6">
                {products.length === 0 ? (
                  <div className="text-center py-8">
                    <FaShoppingBag className="mx-auto text-gray-400 text-4xl mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-3">
                      Aucun produit dans cette boutique
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Commencez par ajouter votre premier produit à cette
                      boutique.
                    </p>
                    <a
                      href={`/client/produits/create?shopId=${selectedShop.shopId}`}
                      className="bg-sna-primary text-white px-6 py-3 rounded-md hover:bg-sna-primary-dark transition duration-300"
                    >
                      Créer un produit
                    </a>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {products.map((product) => (
                      <div
                        key={product.productId}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
                      >
                        {editingProduct === product.productId ? (
                          /* Edit Form */
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Titre
                                </label>
                                <input
                                  type="text"
                                  value={editForm.titre || ""}
                                  onChange={(e) =>
                                    handleFormChange("titre", e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Prix (€)
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm.price || ""}
                                  onChange={(e) =>
                                    handleFormChange("price", e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description
                              </label>
                              <textarea
                                value={editForm.description || ""}
                                onChange={(e) =>
                                  handleFormChange(
                                    "description",
                                    e.target.value
                                  )
                                }
                                rows="3"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Poids (g)
                                </label>
                                <input
                                  type="number"
                                  value={editForm.weight || ""}
                                  onChange={(e) =>
                                    handleFormChange("weight", e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  EAN
                                </label>
                                <input
                                  type="text"
                                  value={editForm.ean || ""}
                                  onChange={(e) =>
                                    handleFormChange("ean", e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Type
                                </label>
                                <select
                                  value={editForm.typeProduit || ""}
                                  onChange={(e) =>
                                    handleFormChange(
                                      "typeProduit",
                                      e.target.value
                                    )
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                >
                                  <option value="Phono">Phono</option>
                                  <option value="Merch">Merch</option>
                                </select>
                              </div>
                            </div>

                            {/* Sizes */}
                            <div className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center mb-3">
                                <label className="block text-sm font-medium text-gray-700 mr-4">
                                  Tailles
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editForm.hasSizes || false}
                                    onChange={(e) =>
                                      handleFormChange(
                                        "hasSizes",
                                        e.target.checked
                                      )
                                    }
                                    className="form-checkbox h-4 w-4 text-sna-primary"
                                  />
                                  <span className="ml-2 text-sm">
                                    Disponible en tailles
                                  </span>
                                </label>
                              </div>
                              {editForm.hasSizes && (
                                <div className="grid grid-cols-5 gap-2">
                                  {availableSizes.map((size) => (
                                    <label
                                      key={size}
                                      className="flex items-center"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={
                                          editForm.sizes?.includes(size) ||
                                          false
                                        }
                                        onChange={() => handleSizeToggle(size)}
                                        className="form-checkbox h-4 w-4 text-sna-primary"
                                      />
                                      <span className="ml-1 text-sm">
                                        {size}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Colors */}
                            <div className="border border-gray-200 rounded-lg p-3">
                              <div className="flex items-center mb-3">
                                <label className="block text-sm font-medium text-gray-700 mr-4">
                                  Couleurs
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editForm.hasColors || false}
                                    onChange={(e) =>
                                      handleFormChange(
                                        "hasColors",
                                        e.target.checked
                                      )
                                    }
                                    className="form-checkbox h-4 w-4 text-sna-primary"
                                  />
                                  <span className="ml-2 text-sm">
                                    Disponible en couleurs
                                  </span>
                                </label>
                              </div>
                              {editForm.hasColors && (
                                <div className="space-y-2">
                                  <select
                                    onChange={handleColorChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                    value=""
                                  >
                                    <option value="">
                                      Ajouter une couleur
                                    </option>
                                    {availableColors
                                      .filter(
                                        (color) =>
                                          !editForm.colors?.includes(color)
                                      )
                                      .map((color) => (
                                        <option key={color} value={color}>
                                          {color}
                                        </option>
                                      ))}
                                  </select>
                                  {editForm.colors?.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {editForm.colors.map((color) => (
                                        <span
                                          key={color}
                                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                                        >
                                          {color}
                                          <button
                                            type="button"
                                            onClick={() => removeColor(color)}
                                            className="ml-2 text-blue-600 hover:text-blue-800"
                                          >
                                            ×
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Stock Section */}
                            <div className="border border-gray-200 rounded-lg p-4">
                              <h4 className="text-lg font-medium text-gray-900 mb-4">
                                Gestion des stocks
                              </h4>

                              {(() => {
                                const combinations =
                                  generateStockCombinations();

                                if (combinations.length === 0) {
                                  return (
                                    <p className="text-gray-500 text-sm">
                                      Sélectionnez des tailles et/ou couleurs
                                      pour gérer les stocks par variante.
                                    </p>
                                  );
                                }

                                return (
                                  <div className="space-y-4">
                                    {combinations.length > 6 ? (
                                      // Grid layout for many combinations
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {combinations.map((combo) => (
                                          <div
                                            key={combo.key}
                                            className="flex items-center space-x-3"
                                          >
                                            <label className="flex-1 text-sm font-medium text-gray-700">
                                              {combo.label}
                                            </label>
                                            <input
                                              type="number"
                                              min="0"
                                              value={
                                                editForm.stock?.[combo.key] ||
                                                ""
                                              }
                                              onChange={(e) =>
                                                handleStockChange(
                                                  combo.key,
                                                  e.target.value
                                                )
                                              }
                                              className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary text-sm"
                                              placeholder="0"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      // List layout for few combinations
                                      <div className="space-y-3">
                                        {combinations.map((combo) => (
                                          <div
                                            key={combo.key}
                                            className="flex items-center justify-between"
                                          >
                                            <label className="text-sm font-medium text-gray-700">
                                              {combo.label}
                                            </label>
                                            <div className="flex items-center space-x-2">
                                              <input
                                                type="number"
                                                min="0"
                                                value={
                                                  editForm.stock?.[combo.key] ||
                                                  ""
                                                }
                                                onChange={(e) =>
                                                  handleStockChange(
                                                    combo.key,
                                                    e.target.value
                                                  )
                                                }
                                                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                                placeholder="0"
                                              />
                                              <span className="text-sm text-gray-500">
                                                unités
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Stock summary */}
                                    {combinations.length > 0 && (
                                      <div className="mt-4 pt-3 border-t border-gray-200">
                                        <div className="flex justify-between items-center text-sm">
                                          <span className="font-medium text-gray-700">
                                            Stock total :
                                          </span>
                                          <span className="text-lg font-semibold text-sna-primary">
                                            {Object.values(
                                              editForm.stock || {}
                                            ).reduce((total, stock) => {
                                              return (
                                                total + (parseInt(stock) || 0)
                                              );
                                            }, 0)}{" "}
                                            unités
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Status Information (Read-only) */}
                            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Statut du produit (géré par l'équipe)
                              </label>
                              <div className="grid grid-cols-4 gap-4">
                                <div className="flex items-center">
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      editForm.active
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {editForm.active ? "Actif" : "Inactif"}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      editForm.documented
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {editForm.documented
                                      ? "Documenté"
                                      : "Non documenté"}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      editForm.hasShopify
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {editForm.hasShopify
                                      ? "Sur Shopify"
                                      : "Pas sur Shopify"}
                                  </span>
                                </div>
                                <div className="flex items-center">
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      editForm.hasEC
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {editForm.hasEC ? "EC" : "Pas d'EC"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* OCC for Phono */}
                            {editForm.typeProduit === "Phono" && (
                              <div className="border border-gray-200 rounded-lg p-3">
                                <div className="flex items-center space-x-4">
                                  <label className="block text-sm font-medium text-gray-700">
                                    OCC
                                  </label>
                                  <label className="flex items-center">
                                    <input
                                      type="radio"
                                      name={`occ_${product.productId}`}
                                      checked={!editForm.occ}
                                      onChange={() =>
                                        handleFormChange("occ", false)
                                      }
                                      className="form-radio h-4 w-4 text-sna-primary"
                                    />
                                    <span className="ml-2">Non</span>
                                  </label>
                                  <label className="flex items-center">
                                    <input
                                      type="radio"
                                      name={`occ_${product.productId}`}
                                      checked={editForm.occ || false}
                                      onChange={() =>
                                        handleFormChange("occ", true)
                                      }
                                      className="form-radio h-4 w-4 text-sna-primary"
                                    />
                                    <span className="ml-2">Oui</span>
                                  </label>
                                </div>
                              </div>
                            )}

                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                              <button
                                onClick={() => {
                                  setEditingProduct(null);
                                  setEditForm({});
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition duration-300"
                              >
                                Annuler
                              </button>
                              <button
                                onClick={handleSaveProduct}
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-sna-primary text-white rounded-md hover:bg-sna-primary-dark transition duration-300 disabled:opacity-50"
                              >
                                {isSubmitting
                                  ? "Enregistrement..."
                                  : "Enregistrer"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Product Display */
                          <div>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="text-lg font-semibold text-gray-800 mb-1">
                                  {product.titre}
                                </h3>
                                <div className="flex items-center space-x-4 text-sm text-gray-600">
                                  <span>Prix: {product.price}€</span>
                                  <span>Type: {product.typeProduit}</span>
                                  {product.weight && (
                                    <span>Poids: {product.weight}g</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleEditProduct(product)}
                                  className="text-blue-600 hover:text-blue-800 p-2"
                                  title="Modifier"
                                >
                                  <FaEdit />
                                </button>
                              </div>
                            </div>

                            {product.description && (
                              <p className="text-gray-600 mb-3">
                                {product.description}
                              </p>
                            )}

                            <div className="space-y-4">
                              <div>
                                <span className="font-medium text-gray-700">
                                  Status:
                                </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      product.active
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {product.active ? "Actif" : "Inactif"}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      product.documented
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {product.documented
                                      ? "Documenté"
                                      : "Non documenté"}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      product.hasShopify
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {product.hasShopify
                                      ? "Shopify"
                                      : "Pas sur Shopify"}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      product.hasEC
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                    }`}
                                  >
                                    {product.hasEC ? "EC" : "Pas d'EC"}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                {product.sizes && product.sizes.length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700">
                                      Tailles:
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {product.sizes.map((size) => (
                                        <span
                                          key={size}
                                          className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs"
                                        >
                                          {size}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {product.colors &&
                                  product.colors.length > 0 && (
                                    <div>
                                      <span className="font-medium text-gray-700">
                                        Couleurs:
                                      </span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {product.colors.map((color) => (
                                          <span
                                            key={color}
                                            className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs"
                                          >
                                            {color}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                {product.ean && (
                                  <div>
                                    <span className="font-medium text-gray-700">
                                      EAN:
                                    </span>
                                    <div className="text-gray-600 mt-1">
                                      {typeof product.ean === "object"
                                        ? JSON.stringify(product.ean)
                                        : product.ean}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Stock Information */}
                              {product.stock &&
                                Object.keys(product.stock).length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700">
                                      Stock:
                                    </span>
                                    <div className="mt-2">
                                      {Object.keys(product.stock).length ===
                                        1 &&
                                      product.stock.default !== undefined ? (
                                        // Simple stock
                                        <div className="text-gray-600">
                                          <span className="font-semibold text-sna-primary">
                                            {product.stock.default}
                                          </span>{" "}
                                          unités
                                        </div>
                                      ) : (
                                        // Stock by combinations
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                          {Object.entries(product.stock).map(
                                            ([combination, quantity]) => (
                                              <div
                                                key={combination}
                                                className="flex justify-between items-center bg-gray-100 px-3 py-2 rounded"
                                              >
                                                <span className="text-sm text-gray-700">
                                                  {combination}
                                                </span>
                                                <span className="font-semibold text-sna-primary">
                                                  {quantity}
                                                </span>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                      <div className="mt-2 text-sm text-gray-500">
                                        Total:{" "}
                                        <span className="font-semibold text-sna-primary">
                                          {Object.values(product.stock).reduce(
                                            (total, qty) =>
                                              total + (parseInt(qty) || 0),
                                            0
                                          )}
                                        </span>{" "}
                                        unités
                                      </div>
                                    </div>
                                  </div>
                                )}
                            </div>

                            {product.typeProduit === "Phono" &&
                              product.hasOwnProperty("occ") && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <span className="text-sm font-medium text-gray-700 mr-2">
                                    OCC:
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      product.occ
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-gray-100 text-gray-800"
                                    }`}
                                  >
                                    {product.occ ? "Oui" : "Non"}
                                  </span>
                                </div>
                              )}

                            <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                              Créé le:{" "}
                              {new Date(product.createdAt).toLocaleDateString(
                                "fr-FR"
                              )}
                              {product.updatedAt !== product.createdAt && (
                                <span>
                                  {" "}
                                  • Modifié le:{" "}
                                  {new Date(
                                    product.updatedAt
                                  ).toLocaleDateString("fr-FR")}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MesProduits;
