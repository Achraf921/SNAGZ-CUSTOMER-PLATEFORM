import React, { useState, useEffect } from "react";
import { FaShoppingBag, FaCheckCircle, FaRegCheckCircle } from "react-icons/fa";

// Confirmation Modal Component
function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  productTitle,
  isLoading,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Confirmer l'invalidation
        </h3>
        <p className="text-gray-600 mb-6">
          Êtes-vous sûr de vouloir invalider le produit "{productTitle}" ? Cette
          action déplacera le produit vers la liste des produits en attente de
          validation.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 flex items-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                Invalidation...
              </>
            ) : (
              "Invalider"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Validation button component
function ValidateProductButton({
  productId,
  allFieldsValidated,
  validatedCount,
  totalFields,
  onValidate,
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onValidate();
    } catch (err) {
      setError(err.message || "Erreur lors de la validation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={!allFieldsValidated || loading}
        className={`px-4 py-2 rounded ${
          allFieldsValidated && !loading
            ? "bg-green-500 hover:bg-green-600 text-white"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
        }`}
        title={
          !allFieldsValidated
            ? `Veuillez vérifier tous les champs (${totalFields} requis)`
            : loading
              ? "Validation en cours..."
              : "Cliquez pour valider le produit"
        }
        type="button"
      >
        {loading
          ? "Validation en cours..."
          : `Valider le produit (${validatedCount}/${totalFields} vérifiés)`}
      </button>
      {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
    </div>
  );
}

export default function ProduitsAValider() {
  const [products, setProducts] = useState({
    pending: [],
    validated: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [validationInProgress, setValidationInProgress] = useState(null);
  const [validatedFields, setValidatedFields] = useState({});
  const [searchTermPending, setSearchTermPending] = useState("");
  const [searchTermValidated, setSearchTermValidated] = useState("");
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Helper function to get field value with fallback for old field names
  const getFieldValue = (product, frenchKey, englishKey) => {
    const frenchValue = product[frenchKey];
    const englishValue = product[englishKey];

    // If we have a French value, use it
    if (
      frenchValue !== undefined &&
      frenchValue !== null &&
      frenchValue !== ""
    ) {
      return frenchValue;
    }

    // If we have an English value, use it
    if (
      englishValue !== undefined &&
      englishValue !== null &&
      englishValue !== ""
    ) {
      return englishValue;
    }

    // Return appropriate default based on field type
    if (frenchKey === "tailles" || frenchKey === "couleurs") {
      return [];
    }

    return "";
  };

  // Define validation fields for products
  const validationFields = [
    { key: "titre", label: "Titre" },
    { key: "description", label: "Description" },
    { key: "typeProduit", label: "Type de produit" },
    { key: "price", label: "Prix" },
    { key: "weight", label: "Poids" },
    { key: "ean", label: "Code EAN" },
    { key: "skus", label: "SKUs" },
    { key: "sizes", label: "Tailles disponibles" },
    { key: "colors", label: "Couleurs disponibles" },
    { key: "occ", label: "OCC" },
    { key: "clientName", label: "Client" },
    { key: "shopName", label: "Boutique" },
    { key: "createdAt", label: "Date de création" },
  ];

  const toggleFieldValidation = (productKey, fieldName) => {
    setValidatedFields((prev) => ({
      ...prev,
      [productKey]: {
        ...(prev[productKey] || {}),
        [fieldName]: !prev[productKey]?.[fieldName],
      },
    }));
  };

  const allFieldsValidated = (productKey) => {
    const fields = validatedFields[productKey] || {};
    return validationFields.every((field) => fields[field.key]);
  };

  const getValidatedCount = (productKey) => {
    const fields = validatedFields[productKey] || {};
    return Object.values(fields).filter(Boolean).length;
  };

  const validateProduct = async (product) => {
    try {
      setValidationInProgress(product.productId);

      const response = await fetch(
        `/api/internal/products/${product.clientId}/${product.shopId}/${product.productId}/validate`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            active: true,
          }),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to validate product");
      }

      // Move product from pending to validated
      setProducts((prev) => ({
        pending: prev.pending.filter((p) => p.productId !== product.productId),
        validated: [
          ...prev.validated,
          {
            ...product,
            active: true,
          },
        ],
      }));

      setExpandedProduct(null);
      setValidationInProgress(null);
    } catch (error) {
      console.error("Error validating product:", error);
      setError("Failed to validate product");
      setValidationInProgress(null);
    }
  };

  const unvalidateProduct = async (product) => {
    try {
      const response = await fetch(
        `/api/internal/products/${product.clientId}/${product.shopId}/${product.productId}/validate`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            active: false,
            documented: false,
            hasShopify: false,
            hasEC: false,
          }),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to unvalidate product");
      }

      // Move product from validated to pending
      setProducts((prev) => ({
        pending: [
          ...prev.pending,
          {
            ...product,
            active: false,
            documented: false,
            hasShopify: false,
            hasEC: false,
          },
        ],
        validated: prev.validated.filter(
          (p) => p.productId !== product.productId
        ),
      }));

      setExpandedProduct(null);
      setValidationInProgress(null);
    } catch (error) {
      console.error("Error unvalidating product:", error);
      setError("Failed to unvalidate product");
      setValidationInProgress(null);
    }
  };

  const toggleProduct = (product) => {
    const productKey = `${product.clientId}-${product.shopId}-${product.productId}`;
    const isExpanding = expandedProduct !== productKey;
    setExpandedProduct(isExpanding ? productKey : null);
    setValidationInProgress(isExpanding ? product.productId : null);

    if (isExpanding) {
      // Initialize validated fields if not already set
      setValidatedFields((prev) => ({
        ...prev,
        [productKey]: prev[productKey] || {},
      }));
    }
  };

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/internal/all-products", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Cache-Control": "no-cache",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }

      const data = await response.json();
      const productsArray = Array.isArray(data.products) ? data.products : [];

      // Categorize products based on validation status
      const pendingProducts = productsArray.filter(
        (product) => !product.active
      );
      const validatedProducts = productsArray.filter(
        (product) => product.active
      );

      setProducts({
        pending: pendingProducts,
        validated: validatedProducts,
      });
    } catch (err) {
      console.error("Error fetching products:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Initialize validation state when products are loaded
  useEffect(() => {
    if (products.pending.length > 0) {
      setValidatedFields((prev) => {
        const newState = { ...prev };
        products.pending.forEach((product) => {
          const productKey = `${product.clientId}-${product.shopId}-${product.productId}`;
          if (!newState[productKey]) {
            const productFields = {};
            validationFields.forEach((fieldInfo) => {
              productFields[fieldInfo.key] = false;
            });
            newState[productKey] = productFields;
          }
        });
        return newState;
      });
    }
  }, [products.pending]);

  // Filter products based on search terms
  const filteredPendingProducts = products.pending.filter(
    (product) =>
      (product.titre || "")
        .toLowerCase()
        .includes(searchTermPending.toLowerCase()) ||
      (product.clientName || "")
        .toLowerCase()
        .includes(searchTermPending.toLowerCase()) ||
      (product.shopName || "")
        .toLowerCase()
        .includes(searchTermPending.toLowerCase())
  );

  const filteredValidatedProducts = products.validated.filter(
    (product) =>
      (product.titre || "")
        .toLowerCase()
        .includes(searchTermValidated.toLowerCase()) ||
      (product.clientName || "")
        .toLowerCase()
        .includes(searchTermValidated.toLowerCase()) ||
      (product.shopName || "")
        .toLowerCase()
        .includes(searchTermValidated.toLowerCase())
  );

  const formatValue = (value, field, product = null) => {
    // For fields that might have old/new naming, use the helper
    if (
      !!product &&
      (field === "price" ||
        field === "weight" ||
        field === "ean" ||
        field === "sizes" ||
        field === "colors")
    ) {
      switch (field) {
        case "price":
          value = getFieldValue(product, "prix", "price");
          break;
        case "weight":
          value = getFieldValue(product, "poids", "weight");
          break;
        case "ean":
          // For eans object, show the first available EAN or fallback to old codeEAN field
          const eansObj = product.eans || {};
          const firstEan = Object.values(eansObj).find(Boolean);
          value = firstEan || getFieldValue(product, "codeEAN", "ean");
          break;
        case "sizes":
          value = getFieldValue(product, "tailles", "sizes");
          break;
        case "colors":
          value = getFieldValue(product, "couleurs", "colors");
          break;
        case "skus":
          value = product.skus || {};
          break;
        case "images":
          value = product.images || [];
          break;
      }
    }

    // Handle boolean fields first before the null check
    if (field === "occ") {
      // Check for both uppercase and lowercase OCC field names
      const occValue =
        product?.OCC !== undefined
          ? product.OCC
          : product?.occ !== undefined
            ? product.occ
            : value;
      return occValue ? "Oui" : "Non";
    }

    if (!value && value !== 0) return "-";

    switch (field) {
      case "sizes":
      case "colors":
        return Array.isArray(value) && value.length > 0
          ? value.join(", ")
          : "-";
      case "skus":
        const skuValues = Object.values(value).filter(Boolean);
        return skuValues.length > 0 ? skuValues.join(", ") : "-";
      case "images":
        return Array.isArray(value) && value.length > 0
          ? `${value.length} image(s)`
          : "-";
      case "price":
        return `${value}€`;
      case "weight":
        return `${value}g`;
      case "createdAt":
        return new Date(value).toLocaleDateString();
      default:
        return value.toString();
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          Produits à Valider
        </h1>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          Produits à Valider
        </h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-8">
        Produits à Valider
      </h1>

      <div className="space-y-8">
        {/* Pending Products Section */}
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-yellow-700">
              Produits en attente ({filteredPendingProducts.length})
            </h2>
            <input
              type="text"
              placeholder="Rechercher un produit en attente..."
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
              value={searchTermPending}
              onChange={(e) => setSearchTermPending(e.target.value)}
            />
          </div>
          {filteredPendingProducts.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">
                {searchTermPending
                  ? "Aucun produit en attente trouvé avec ce terme de recherche"
                  : "Aucun produit en attente de validation"}
              </p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-yellow-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Produit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Boutique
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prix
                    </th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPendingProducts.map((product) => {
                    const productKey = `${product.clientId}-${product.shopId}-${product.productId}`;
                    return (
                      <React.Fragment key={productKey}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <FaShoppingBag className="mr-2 text-blue-700" />
                              <span className="text-sm font-medium text-gray-900">
                                {product.titre}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {product.clientName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {product.shopName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {product.typeProduit}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatValue(product.price, "price", product)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => toggleProduct(product)}
                              className="text-blue-600 hover:text-blue-900 font-medium"
                            >
                              {expandedProduct === productKey
                                ? "Fermer"
                                : "Valider"}
                            </button>
                          </td>
                        </tr>
                        {expandedProduct === productKey && (
                          <tr>
                            <td colSpan="6" className="px-6 py-4 bg-gray-50">
                              <div className="space-y-4">
                                <h4 className="font-semibold text-gray-800 mb-4">
                                  Validation des champs - {product.titre}
                                </h4>
                                {validationFields.map((fieldInfo) => (
                                  <div
                                    key={fieldInfo.key}
                                    className="flex items-center space-x-4 p-3 bg-white rounded border"
                                  >
                                    <span className="w-40 text-sm font-medium text-gray-700 flex-shrink-0">
                                      {fieldInfo.label}
                                    </span>
                                    <div className="flex-1">
                                      <span
                                        className={`px-3 py-2 rounded bg-gray-50 border block ${
                                          validatedFields[productKey]?.[
                                            fieldInfo.key
                                          ]
                                            ? "bg-green-50 border-green-200"
                                            : ""
                                        }`}
                                      >
                                        {formatValue(
                                          product[fieldInfo.key],
                                          fieldInfo.key,
                                          product
                                        )}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() =>
                                        toggleFieldValidation(
                                          productKey,
                                          fieldInfo.key
                                        )
                                      }
                                      className="ml-2 p-2 rounded-full hover:bg-gray-200 flex-shrink-0"
                                    >
                                      {validatedFields[productKey]?.[
                                        fieldInfo.key
                                      ] ? (
                                        <FaCheckCircle className="text-green-500 text-lg" />
                                      ) : (
                                        <FaRegCheckCircle className="text-gray-400 text-lg" />
                                      )}
                                    </button>
                                  </div>
                                ))}

                                <div className="mt-6 flex justify-end">
                                  <ValidateProductButton
                                    productId={product.productId}
                                    allFieldsValidated={allFieldsValidated(
                                      productKey
                                    )}
                                    validatedCount={getValidatedCount(
                                      productKey
                                    )}
                                    totalFields={validationFields.length}
                                    onValidate={async () => {
                                      await validateProduct(product);
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Validated Products Section */}
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-green-700">
              Produits validés ({filteredValidatedProducts.length})
            </h2>
            <input
              type="text"
              placeholder="Rechercher un produit validé..."
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
              value={searchTermValidated}
              onChange={(e) => setSearchTermValidated(e.target.value)}
            />
          </div>
          {filteredValidatedProducts.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">
                {searchTermValidated
                  ? "Aucun produit validé trouvé avec ce terme de recherche"
                  : "Aucun produit validé"}
              </p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-green-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Produit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Boutique
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prix
                    </th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredValidatedProducts.map((product) => {
                    const productKey = `${product.clientId}-${product.shopId}-${product.productId}`;
                    return (
                      <tr
                        key={productKey}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FaShoppingBag className="mr-2 text-green-700" />
                            <span className="text-sm font-medium text-gray-900">
                              {product.titre}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.clientName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.shopName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.typeProduit}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatValue(product.price, "price", product)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => {
                              setSelectedProduct(product);
                              setConfirmationModalOpen(true);
                            }}
                            className="text-red-600 hover:text-red-900 font-medium"
                            disabled={
                              validationInProgress === product.productId
                            }
                          >
                            {validationInProgress === product.productId
                              ? "..."
                              : "Invalider"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmationModalOpen && (
        <ConfirmationModal
          isOpen={confirmationModalOpen}
          onClose={() => {
            setConfirmationModalOpen(false);
            setSelectedProduct(null);
            setValidationInProgress(null);
          }}
          onConfirm={async () => {
            try {
              setValidationInProgress(selectedProduct.productId);
              await unvalidateProduct(selectedProduct);
              setConfirmationModalOpen(false);
              setSelectedProduct(null);
              setValidationInProgress(null);
            } catch (error) {
              console.error("Error unvalidating product:", error);
              setError("Failed to unvalidate product");
              setValidationInProgress(null);
            }
          }}
          productTitle={selectedProduct?.titre}
          isLoading={validationInProgress === selectedProduct?.productId}
        />
      )}
    </div>
  );
}
