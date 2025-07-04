import React, { useState, useEffect } from "react";
import {
  FaStore,
  FaShoppingBag,
  FaCheckCircle,
  FaExclamationTriangle,
} from "react-icons/fa";

const CreateProduct = () => {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [userId, setUserId] = useState(null);

  // Product form state
  const [productForm, setProductForm] = useState({
    titre: "",
    description: "",
    hasSizes: false,
    sizes: [],
    price: "",
    weight: "",
    ean: "",
    hasColors: false,
    colors: [],
    typeProduit: "",
    occ: false,
    active: false,
    documented: false,
    hasShopify: false,
    hasEC: false,
    stock: {}, // Stock for each size/color combination
  });

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
        // Filter only shops that are valid, documented, and have shopify configured
        const validShops = (data.shops || []).filter(
          (shop) =>
            shop.status === "valid" &&
            shop.documented === "documented" &&
            shop.hasShopify === true
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

  // Clean up stock when sizes or colors change
  useEffect(() => {
    cleanupStock();
  }, [
    productForm.sizes,
    productForm.colors,
    productForm.hasSizes,
    productForm.hasColors,
  ]);

  const handleInputChange = (field, value) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSizeToggle = (size) => {
    setProductForm((prev) => ({
      ...prev,
      sizes: prev.sizes.includes(size)
        ? prev.sizes.filter((s) => s !== size)
        : [...prev.sizes, size],
    }));
  };

  const handleColorChange = (e) => {
    const value = e.target.value;
    if (value && !productForm.colors.includes(value)) {
      setProductForm((prev) => ({
        ...prev,
        colors: [...prev.colors, value],
      }));
    }
  };

  const removeColor = (colorToRemove) => {
    setProductForm((prev) => ({
      ...prev,
      colors: prev.colors.filter((color) => color !== colorToRemove),
    }));
  };

  // Generate all size/color combinations for stock tracking
  const generateStockCombinations = () => {
    const combinations = [];

    if (productForm.hasSizes && productForm.hasColors) {
      // Both sizes and colors
      productForm.sizes.forEach((size) => {
        productForm.colors.forEach((color) => {
          combinations.push({
            key: `${size}-${color}`,
            label: `${size} - ${color}`,
            size,
            color,
          });
        });
      });
    } else if (productForm.hasSizes && !productForm.hasColors) {
      // Only sizes
      productForm.sizes.forEach((size) => {
        combinations.push({
          key: size,
          label: `Taille ${size}`,
          size,
          color: null,
        });
      });
    } else if (!productForm.hasSizes && productForm.hasColors) {
      // Only colors
      productForm.colors.forEach((color) => {
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
    setProductForm((prev) => ({
      ...prev,
      stock: {
        ...prev.stock,
        [combinationKey]: stockValue,
      },
    }));
  };

  // Clean up stock when sizes/colors change
  const cleanupStock = () => {
    const validCombinations = generateStockCombinations();
    const validKeys = validCombinations.map((combo) => combo.key);

    setProductForm((prev) => {
      const cleanedStock = {};
      validKeys.forEach((key) => {
        if (prev.stock[key] !== undefined) {
          cleanedStock[key] = prev.stock[key];
        }
      });
      return {
        ...prev,
        stock: cleanedStock,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedShop) return;

    // Validation
    if (!productForm.titre || !productForm.price || !productForm.typeProduit) {
      setError(
        "Veuillez remplir tous les champs obligatoires (Titre, Prix, Type de produit)"
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const productData = {
        titre: productForm.titre,
        description: productForm.description,
        prix: parseFloat(productForm.price),
        poids: productForm.weight ? parseFloat(productForm.weight) : null,
        codeEAN: productForm.ean,
        typeProduit: productForm.typeProduit,
        OCC: productForm.occ,
        tailles: productForm.hasSizes ? productForm.sizes : [],
        couleurs: productForm.hasColors ? productForm.colors : [],
        stock: productForm.stock,
        shopId: selectedShop.shopId,
      };

      const apiUrl =
        process.env.NODE_ENV === "production"
          ? `/api/customer/shops/${userId}/${selectedShop.shopId}/products`
          : `http://localhost:5000/api/customer/shops/${userId}/${selectedShop.shopId}/products`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Erreur lors de la création du produit"
        );
      }

      setSubmitSuccess(true);
      // Reset form
      setProductForm({
        titre: "",
        description: "",
        hasSizes: false,
        sizes: [],
        price: "",
        weight: "",
        ean: "",
        hasColors: false,
        colors: [],
        typeProduit: "",
        occ: false,
        active: false,
        documented: false,
        hasShopify: false,
        hasEC: false,
        stock: {},
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
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
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Créer un Produit
        </h1>
        <p className="text-gray-600">
          Seules les boutiques valides, documentées et ayant un store Shopify
          configuré peuvent avoir des produits. Sélectionnez d'abord une
          boutique éligible.
        </p>
      </div>

      {submitSuccess && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-6">
          <div className="flex items-center">
            <FaCheckCircle className="mr-2" />
            <span>Produit créé avec succès !</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6">
          <div className="flex items-center">
            <FaExclamationTriangle className="mr-2" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Shop Selection */}
      {!selectedShop ? (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Sélectionner une Boutique
          </h2>

          {shops.length === 0 ? (
            <div className="bg-white p-8 rounded-lg shadow-md text-center">
              <FaStore className="mx-auto text-gray-400 text-6xl mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-3">
                Aucune boutique éligible trouvée
              </h3>
              <p className="text-gray-600 mb-6">
                Pour créer des produits, votre boutique doit être{" "}
                <strong>validée</strong>, <strong>documentée</strong> et avoir
                un <strong>store Shopify configuré</strong>.
              </p>
              <a
                href="/client/boutiques"
                className="bg-sna-primary text-white px-6 py-3 rounded-md hover:bg-sna-primary-dark transition duration-300"
              >
                Gérer mes boutiques
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {shops.map((shop) => (
                <div
                  key={shop.shopId}
                  className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 cursor-pointer border-2 border-gray-200 hover:border-sna-primary"
                  onClick={() => setSelectedShop(shop)}
                >
                  <div className="flex items-center mb-4">
                    <FaStore className="text-sna-primary text-2xl mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {shop.nomProjet || shop.name || "Boutique"}
                      </h3>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <FaCheckCircle className="mr-1" />
                        Validée
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Cliquez pour sélectionner cette boutique
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Product Creation Form */
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FaStore className="text-sna-primary text-xl mr-3" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">
                    Créer un produit pour:{" "}
                    {selectedShop.nomProjet || selectedShop.name}
                  </h2>
                  <span className="text-sm text-green-600">
                    Boutique validée
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedShop(null)}
                className="text-gray-500 hover:text-gray-700 text-sm underline"
              >
                Changer de boutique
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Titre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={productForm.titre}
                  onChange={(e) => handleInputChange("titre", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type de produit <span className="text-red-500">*</span>
                </label>
                <select
                  value={productForm.typeProduit}
                  onChange={(e) =>
                    handleInputChange("typeProduit", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                  required
                >
                  <option value="">Sélectionner un type</option>
                  <option value="Phono">Phono</option>
                  <option value="Merch">Merch</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={productForm.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                rows="4"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
              />
            </div>

            {/* Price and Weight */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prix (€) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={productForm.price}
                  onChange={(e) => handleInputChange("price", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Poids (grammes)
                </label>
                <input
                  type="number"
                  value={productForm.weight}
                  onChange={(e) => handleInputChange("weight", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Numéro EAN
                </label>
                <input
                  type="text"
                  value={productForm.ean}
                  onChange={(e) => handleInputChange("ean", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                />
              </div>
            </div>

            {/* Sizes Section */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center mb-4">
                <label className="block text-sm font-medium text-gray-700 mr-4">
                  Tailles disponibles
                </label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="hasSizes"
                      checked={!productForm.hasSizes}
                      onChange={() => handleInputChange("hasSizes", false)}
                      className="form-radio h-4 w-4 text-sna-primary"
                    />
                    <span className="ml-2">Non</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="hasSizes"
                      checked={productForm.hasSizes}
                      onChange={() => handleInputChange("hasSizes", true)}
                      className="form-radio h-4 w-4 text-sna-primary"
                    />
                    <span className="ml-2">Oui</span>
                  </label>
                </div>
              </div>

              {productForm.hasSizes && (
                <div className="grid grid-cols-5 gap-2">
                  {availableSizes.map((size) => (
                    <label key={size} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={productForm.sizes.includes(size)}
                        onChange={() => handleSizeToggle(size)}
                        className="form-checkbox h-4 w-4 text-sna-primary"
                      />
                      <span className="ml-2">{size}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Colors Section */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center mb-4">
                <label className="block text-sm font-medium text-gray-700 mr-4">
                  Couleurs (optionnel)
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={productForm.hasColors}
                    onChange={(e) =>
                      handleInputChange("hasColors", e.target.checked)
                    }
                    className="form-checkbox h-4 w-4 text-sna-primary"
                  />
                  <span className="ml-2">Ajouter des couleurs</span>
                </label>
              </div>

              {productForm.hasColors && (
                <div>
                  <select
                    onChange={handleColorChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary mb-3"
                    value=""
                  >
                    <option value="">Ajouter une couleur</option>
                    {availableColors
                      .filter((color) => !productForm.colors.includes(color))
                      .map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                  </select>

                  {productForm.colors.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {productForm.colors.map((color) => (
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
                const combinations = generateStockCombinations();

                if (combinations.length === 0) {
                  return (
                    <p className="text-gray-500 text-sm">
                      Sélectionnez des tailles et/ou couleurs pour gérer les
                      stocks par variante.
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
                              value={productForm.stock[combo.key] || ""}
                              onChange={(e) =>
                                handleStockChange(combo.key, e.target.value)
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
                                value={productForm.stock[combo.key] || ""}
                                onChange={(e) =>
                                  handleStockChange(combo.key, e.target.value)
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
                            {Object.values(productForm.stock).reduce(
                              (total, stock) => {
                                return total + (parseInt(stock) || 0);
                              },
                              0
                            )}{" "}
                            unités
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* OCC for Phono products */}
            {productForm.typeProduit === "Phono" && (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center space-x-4">
                  <label className="block text-sm font-medium text-gray-700">
                    OCC
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="occ"
                      checked={!productForm.occ}
                      onChange={() => handleInputChange("occ", false)}
                      className="form-radio h-4 w-4 text-sna-primary"
                    />
                    <span className="ml-2">Non</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="occ"
                      checked={productForm.occ}
                      onChange={() => handleInputChange("occ", true)}
                      className="form-radio h-4 w-4 text-sna-primary"
                    />
                    <span className="ml-2">Oui</span>
                  </label>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setSelectedShop(null)}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition duration-300"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-sna-primary text-white rounded-md hover:bg-sna-primary-dark transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Création en cours...
                  </>
                ) : (
                  <>
                    <FaShoppingBag className="mr-2" />
                    Créer le produit
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CreateProduct;
