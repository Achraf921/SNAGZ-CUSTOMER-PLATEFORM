import React, { useState, useEffect } from "react";
import {
  FaEdit,
  FaSave,
  FaTimes,
  FaSearch,
  FaCube,
  FaTrash,
  FaExclamationTriangle,
} from "react-icons/fa";

const Produits = () => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState({});
  const [editingField, setEditingField] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  const handleDeleteClick = (product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;

    try {
      const response = await fetch(
        `/api/internal/products/${productToDelete.clientId}/${productToDelete.shopId}/${productToDelete.productId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        setProducts((prev) =>
          prev.filter((p) => p.productId !== productToDelete.productId)
        );
        setError(null);
      } else {
        setError(data.message || "Erreur lors de la suppression du produit");
      }
    } catch (err) {
      setError("Erreur de connexion lors de la suppression");
    } finally {
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
    }
  };

  const colorOptions = [
    "Rouge",
    "Bleu",
    "Vert",
    "Jaune",
    "Orange",
    "Violet",
    "Rose",
    "Cyan",
    "Marron",
    "Gris",
    "Noir",
    "Blanc",
  ];

  const sizeOptions = ["XS", "S", "M", "L", "XL"];

  // Generate all size/color combinations for stock tracking
  const generateStockCombinations = (product) => {
    if (!product) return [];

    const combinations = [];
    const sizes = getFieldValue(product, "tailles", "sizes") || [];
    const colors = getFieldValue(product, "couleurs", "colors") || [];

    if (sizes.length > 0 && colors.length > 0) {
      // Both sizes and colors
      sizes.forEach((size) => {
        colors.forEach((color) => {
          combinations.push({
            key: `${size}-${color}`,
            label: `${size} - ${color}`,
            size,
            color,
          });
        });
      });
    } else if (sizes.length > 0 && colors.length === 0) {
      // Only sizes
      sizes.forEach((size) => {
        combinations.push({
          key: size,
          label: `Taille ${size}`,
          size,
          color: null,
        });
      });
    } else if (sizes.length === 0 && colors.length > 0) {
      // Only colors
      colors.forEach((color) => {
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
  const handleStockChange = (combinationKey, value, fieldName) => {
    const stockValue = value === "" ? "" : Math.max(0, parseInt(value) || 0);
    setEditForm((prev) => ({
      ...prev,
      [fieldName]: {
        ...(prev[fieldName] || {}),
        [combinationKey]: stockValue,
      },
    }));
  };

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

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/internal/all-products");
      if (!response.ok)
        throw new Error("Erreur lors du chargement des produits");

      const data = await response.json();
      if (data.success) {
        setProducts(data.products || []);
      } else {
        throw new Error("Erreur lors du chargement des produits");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = products.filter(
    (product) =>
      product.titre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.shopName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.typeProduit?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleRow = (productKey) => {
    setExpandedRows((prev) => ({
      ...prev,
      [productKey]: !prev[productKey],
    }));
  };

  const handleFieldEdit = (product, fieldName) => {
    const fieldKey = `${product.productId}-${fieldName}`;
    setEditingField(fieldKey);

    let initialValue;
    if (fieldName === "eans") {
      // For eans field, get the first available EAN or fallback to codeEAN
      const eansObj = product.eans || {};
      const firstEan = Object.values(eansObj).find(Boolean);
      initialValue = firstEan || product.codeEAN || "";
    } else {
      // Map French field names to English equivalents
      const fieldMapping = {
        prix: "price",
        poids: "weight",
        tailles: "sizes",
        couleurs: "colors",
      };
      const englishFieldName = fieldMapping[fieldName] || fieldName;
      initialValue =
        getFieldValue(product, fieldName, englishFieldName) ||
        product[fieldName];
    }

    setEditForm({
      [fieldName]: initialValue,
    });
  };

  const handleFieldCancel = () => {
    setEditingField(null);
    setEditForm({});
  };

  const handleFieldSave = async (product, fieldName) => {
    try {
      setSaving(true);

      let updateData;
      if (fieldName === "eans") {
        // For eans field, save to the 'default' key in eans object
        updateData = {
          eans: {
            ...(product.eans || {}),
            default: editForm[fieldName],
          },
        };
      } else {
        updateData = { [fieldName]: editForm[fieldName] };
      }

      const response = await fetch(
        `/api/internal/products/${product.clientId}/${product.shopId}/${product.productId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        }
      );

      const data = await response.json();

      if (data.success) {
        setProducts((prevProducts) =>
          prevProducts.map((p) =>
            p.productId === product.productId
              ? {
                  ...p,
                  ...(fieldName === "eans"
                    ? { eans: updateData.eans }
                    : { [fieldName]: editForm[fieldName] }),
                  updatedAt: new Date().toISOString(),
                }
              : p
          )
        );
        setEditingField(null);
        setEditForm({});
        setError(null);
      } else {
        setError("Erreur lors de la mise à jour du produit");
      }
    } catch (err) {
      console.error("Error updating product:", err);
      setError("Erreur de connexion lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  // Component for rendering individual editable fields
  const EditableField = ({
    product,
    fieldName,
    label,
    type = "text",
    options = null,
  }) => {
    const fieldKey = `${product.productId}-${fieldName}`;
    const isEditing = editingField === fieldKey;

    // Map French field names to English equivalents for getFieldValue
    const fieldMapping = {
      prix: "price",
      poids: "weight",
      eans: "ean",
      tailles: "sizes",
      couleurs: "colors",
    };

    const englishFieldName = fieldMapping[fieldName] || fieldName;

    // Special handling for eans field
    let currentValue;
    if (fieldName === "eans") {
      const eansObj = product.eans || {};
      const firstEan = Object.values(eansObj).find(Boolean);
      currentValue = firstEan || product.codeEAN || "";
    } else {
      currentValue =
        getFieldValue(product, fieldName, englishFieldName) ||
        (typeof product[fieldName] === "object"
          ? JSON.stringify(product[fieldName])
          : product[fieldName]);
    }

    if (isEditing) {
      return (
        <div className="flex items-center space-x-2">
          <strong className="w-20 text-sm">{label}:</strong>
          <div className="flex-1">
            {type === "select" ? (
              <select
                value={editForm[fieldName] || ""}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    [fieldName]: e.target.value,
                  }))
                }
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : type === "checkbox" ? (
              <input
                type="checkbox"
                checked={!!editForm[fieldName]}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    [fieldName]: e.target.checked,
                  }))
                }
                className="h-4 w-4"
              />
            ) : type === "textarea" ? (
              <textarea
                value={editForm[fieldName] || ""}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    [fieldName]: e.target.value,
                  }))
                }
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                rows="2"
              />
            ) : type === "array" ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-500">
                  Sélectionnez les options:
                </div>
                <div className="flex flex-wrap gap-2">
                  {options.map((option) => (
                    <label key={option} className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={(editForm[fieldName] || []).includes(option)}
                        onChange={(e) => {
                          const currentArray = editForm[fieldName] || [];
                          const newArray = e.target.checked
                            ? [...currentArray, option]
                            : currentArray.filter((item) => item !== option);
                          setEditForm((prev) => ({
                            ...prev,
                            [fieldName]: newArray,
                          }));
                        }}
                        className="mr-1"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <input
                type={type}
                step={type === "number" ? "0.01" : undefined}
                value={editForm[fieldName] || ""}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    [fieldName]: e.target.value,
                  }))
                }
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            )}
          </div>
          <button
            onClick={() => handleFieldSave(product, fieldName)}
            disabled={saving}
            className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
          >
            <FaSave />
          </button>
          <button
            onClick={handleFieldCancel}
            disabled={saving}
            className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 disabled:opacity-50"
          >
            <FaTimes />
          </button>
        </div>
      );
    }

    // Display mode
    let displayValue;
    if (type === "checkbox") {
      displayValue = currentValue ? "Oui" : "Non";
    } else if (type === "array") {
      displayValue =
        Array.isArray(currentValue) && currentValue.length > 0
          ? currentValue.join(", ")
          : "-";
    } else if (type === "number" && fieldName === "prix") {
      displayValue = currentValue ? `${currentValue}€` : "-";
    } else if (type === "number" && fieldName === "poids") {
      displayValue = currentValue ? `${currentValue}g` : "-";
    } else {
      displayValue = currentValue || "-";
    }

    return (
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <strong>{label}:</strong> {displayValue}
        </div>
        <button
          onClick={() => handleFieldEdit(product, fieldName)}
          className="px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded text-xs transition-colors"
          title="Modifier ce champ"
        >
          <FaEdit />
        </button>
      </div>
    );
  };

  // Special component for stock editing
  const StockField = ({ product }) => {
    const fieldKey = `${product.productId}-stock`;
    const isEditing = editingField === fieldKey;
    const currentStock = product.stock || {};
    const combinations = generateStockCombinations(product);

    const handleStockEdit = () => {
      setEditingField(fieldKey);
      setEditForm({
        stock: { ...currentStock },
      });
    };

    const handleStockSave = async () => {
      try {
        setSaving(true);

        const response = await fetch(
          `/api/internal/products/${product.clientId}/${product.shopId}/${product.productId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ stock: editForm.stock }),
          }
        );

        const data = await response.json();

        if (data.success) {
          setProducts((prevProducts) =>
            prevProducts.map((p) =>
              p.productId === product.productId
                ? {
                    ...p,
                    stock: editForm.stock,
                    updatedAt: new Date().toISOString(),
                  }
                : p
            )
          );
          setEditingField(null);
          setEditForm({});
          setError(null);
        } else {
          setError("Erreur lors de la mise à jour du stock");
        }
      } catch (err) {
        console.error("Error updating stock:", err);
        setError("Erreur de connexion lors de la mise à jour du stock");
      } finally {
        setSaving(false);
      }
    };

    if (isEditing) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Stock par variante:</strong>
            <div className="flex space-x-2">
              <button
                onClick={handleStockSave}
                disabled={saving}
                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
              >
                <FaSave />
              </button>
              <button
                onClick={handleFieldCancel}
                disabled={saving}
                className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 disabled:opacity-50"
              >
                <FaTimes />
              </button>
            </div>
          </div>

          {combinations.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Aucune variante définie. Ajoutez des tailles et/ou couleurs pour
              gérer les stocks par variante.
            </p>
          ) : (
            <div className="space-y-3">
              {combinations.length > 6 ? (
                // Grid layout for many combinations
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {combinations.map((combo) => (
                    <div
                      key={combo.key}
                      className="flex items-center space-x-2"
                    >
                      <label className="flex-1 text-xs font-medium text-gray-700">
                        {combo.label}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.stock?.[combo.key] || ""}
                        onChange={(e) =>
                          handleStockChange(combo.key, e.target.value, "stock")
                        }
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                // List layout for few combinations
                <div className="space-y-2">
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
                          value={editForm.stock?.[combo.key] || ""}
                          onChange={(e) =>
                            handleStockChange(
                              combo.key,
                              e.target.value,
                              "stock"
                            )
                          }
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="0"
                        />
                        <span className="text-xs text-gray-500">unités</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stock summary */}
              {combinations.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-gray-700">
                      Stock total :
                    </span>
                    <span className="text-lg font-semibold text-sna-primary">
                      {Object.values(editForm.stock || {}).reduce(
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
          )}
        </div>
      );
    }

    // Display mode
    if (!currentStock || Object.keys(currentStock).length === 0) {
      return (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <strong>Stock:</strong> Non défini
          </div>
          <button
            onClick={handleStockEdit}
            className="px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded text-xs transition-colors"
            title="Modifier le stock"
          >
            <FaEdit />
          </button>
        </div>
      );
    }

    const totalStock = Object.values(currentStock).reduce(
      (total, qty) => total + (parseInt(qty) || 0),
      0
    );

    return (
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <strong>Stock:</strong>
          <div className="mt-1">
            {Object.keys(currentStock).length === 1 &&
            currentStock.default !== undefined ? (
              // Simple stock
              <div className="text-gray-600">
                <span className="font-semibold text-sna-primary">
                  {currentStock.default}
                </span>{" "}
                unités
              </div>
            ) : (
              // Stock by combinations
              <div className="space-y-1">
                {Object.entries(currentStock)
                  .slice(0, 3)
                  .map(([combination, quantity]) => (
                    <div
                      key={combination}
                      className="flex justify-between items-center text-xs bg-gray-100 px-2 py-1 rounded"
                    >
                      <span className="text-gray-700">{combination}</span>
                      <span className="font-semibold text-sna-primary">
                        {quantity}
                      </span>
                    </div>
                  ))}
                {Object.keys(currentStock).length > 3 && (
                  <div className="text-xs text-gray-500">
                    ... et {Object.keys(currentStock).length - 3} autre(s)
                  </div>
                )}
              </div>
            )}
            <div className="mt-1 text-xs text-gray-500">
              Total:{" "}
              <span className="font-semibold text-sna-primary">
                {totalStock}
              </span>{" "}
              unités
            </div>
          </div>
        </div>
        <button
          onClick={handleStockEdit}
          className="px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded text-xs transition-colors"
          title="Modifier le stock"
        >
          <FaEdit />
        </button>
      </div>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (value, trueText, falseText) => {
    const bgColor = value
      ? "bg-green-100 text-green-800"
      : "bg-yellow-100 text-yellow-800";
    const text = value ? trueText : falseText;
    return (
      <span
        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor}`}
      >
        {text}
      </span>
    );
  };

  if (isLoading) return <p>Chargement des produits...</p>;
  if (error) return <p>Erreur: {error}</p>;

  return (
    <div className="w-full p-4">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Tous les Produits</h1>
        <input
          type="text"
          placeholder="Rechercher par titre, client, boutique ou type..."
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredProducts.length === 0 ? (
        <p>Aucun produit trouvé.</p>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Produit
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Client / Boutique
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Prix
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Stock
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Statuts
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.map((product) => {
                const productKey = `${product.clientId}-${product.shopId}-${product.productId}`;
                return (
                  <React.Fragment key={productKey}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {product.imageUrls &&
                            product.imageUrls.length > 0 ? (
                              <img
                                className="h-10 w-10 rounded-md object-cover"
                                src={product.imageUrls[0]}
                                alt={product.titre || "Product image"}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center">
                                <FaCube className="h-5 w-5 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {product.titre || "-"}
                            </div>
                            {product.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {product.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {product.clientName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {product.shopName}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          {product.typeProduit}
                        </span>
                        {product.typeProduit === "Phono" && (
                          <div className="mt-1">
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                product.OCC
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              OCC: {product.OCC || product.occ ? "Oui" : "Non"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">
                          {getFieldValue(product, "prix", "price")
                            ? `${getFieldValue(product, "prix", "price")}€`
                            : "-"}
                        </div>
                        {getFieldValue(product, "poids", "weight") && (
                          <div className="text-gray-500">
                            {getFieldValue(product, "poids", "weight")}g
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {product.stock &&
                        Object.keys(product.stock).length > 0 ? (
                          <div>
                            <div className="font-medium text-sna-primary">
                              {Object.values(product.stock).reduce(
                                (total, qty) => total + (parseInt(qty) || 0),
                                0
                              )}{" "}
                              unités
                            </div>
                            {Object.keys(product.stock).length > 1 && (
                              <div className="text-gray-500 text-xs">
                                {Object.keys(product.stock).length} variante(s)
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-gray-500">Non défini</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {getStatusBadge(product.active, "Actif", "Inactif")}
                          {getStatusBadge(
                            product.documented,
                            "Documenté",
                            "Non documenté"
                          )}
                          {getStatusBadge(
                            product.hasShopify,
                            "Shopify",
                            "Pas Shopify"
                          )}
                          {getStatusBadge(product.hasEC, "EC", "Pas d'EC")}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => toggleRow(productKey)}
                          className="text-sna-primary hover:underline"
                        >
                          {expandedRows[productKey]
                            ? "Masquer"
                            : "Voir Détails"}
                        </button>
                      </td>
                    </tr>
                    {expandedRows[productKey] && (
                      <tr>
                        <td colSpan="7" className="px-6 py-4 bg-gray-50">
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h3 className="text-lg font-medium text-gray-900">
                                Détails du Produit: {product.titre}
                              </h3>
                              <button
                                onClick={() => handleDeleteClick(product)}
                                className="flex items-center px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors"
                              >
                                <FaTrash className="mr-2" />
                                Supprimer
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                <h4 className="font-medium text-gray-900 mb-3">
                                  Informations générales
                                </h4>
                                <EditableField
                                  product={product}
                                  fieldName="titre"
                                  label="Titre"
                                  type="text"
                                />
                                <EditableField
                                  product={product}
                                  fieldName="description"
                                  label="Description"
                                  type="textarea"
                                />
                                <EditableField
                                  product={product}
                                  fieldName="typeProduit"
                                  label="Type"
                                  type="select"
                                  options={[
                                    { value: "Phono", label: "Phono" },
                                    { value: "Merch", label: "Merch" },
                                  ]}
                                />
                                {product.typeProduit === "Phono" && (
                                  <EditableField
                                    product={product}
                                    fieldName="OCC"
                                    label="OCC"
                                    type="checkbox"
                                  />
                                )}
                              </div>

                              <div className="space-y-3">
                                <h4 className="font-medium text-gray-900 mb-3">
                                  Détails techniques
                                </h4>
                                <EditableField
                                  product={product}
                                  fieldName="prix"
                                  label="Prix"
                                  type="number"
                                />
                                <EditableField
                                  product={product}
                                  fieldName="poids"
                                  label="Poids"
                                  type="number"
                                />
                                <EditableField
                                  product={product}
                                  fieldName="eans"
                                  label="Code EAN"
                                  type="text"
                                />
                                {/* SKU Display */}
                                {product.skus && (
                                  <div className="text-sm text-gray-600">
                                    <strong>SKU(s):</strong>{" "}
                                    {Object.keys(product.skus).length === 1 &&
                                    product.skus.default !== undefined ? (
                                      <span className="text-sna-primary font-medium">
                                        {product.skus.default}
                                      </span>
                                    ) : (
                                      <span>
                                        {Object.values(product.skus)
                                          .filter(Boolean)
                                          .slice(0, 3)
                                          .join(", ")}
                                        {Object.values(product.skus).filter(
                                          Boolean
                                        ).length > 3 &&
                                          ` + ${
                                            Object.values(product.skus).filter(
                                              Boolean
                                            ).length - 3
                                          } autre(s)`}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3">
                                <h4 className="font-medium text-gray-900 mb-3">
                                  Variantes
                                </h4>
                                <EditableField
                                  product={product}
                                  fieldName="tailles"
                                  label="Tailles"
                                  type="array"
                                  options={sizeOptions}
                                />
                                <EditableField
                                  product={product}
                                  fieldName="couleurs"
                                  label="Couleurs"
                                  type="array"
                                  options={colorOptions}
                                />
                                <StockField product={product} />
                              </div>

                              <div className="space-y-3">
                                <h4 className="font-medium text-gray-900 mb-3">
                                  Statuts{" "}
                                  <span className="text-xs text-gray-500">
                                    (géré par l'équipe)
                                  </span>
                                </h4>
                                <div className="space-y-1 text-sm text-gray-600">
                                  <div>
                                    <strong>Actif:</strong>{" "}
                                    {product.active ? "Oui" : "Non"}
                                  </div>
                                  <div>
                                    <strong>Documenté:</strong>{" "}
                                    {product.documented ? "Oui" : "Non"}
                                  </div>
                                  <div>
                                    <strong>Shopify:</strong>{" "}
                                    {product.hasShopify ? "Oui" : "Non"}
                                  </div>
                                  <div>
                                    <strong>E-Commerce:</strong>{" "}
                                    {product.hasEC ? "Oui" : "Non"}
                                  </div>
                                </div>
                              </div>

                              <div className="md:col-span-2 space-y-1 text-sm text-gray-600">
                                <h4 className="font-medium text-gray-900 mb-3">
                                  Dates
                                </h4>
                                <div>
                                  <strong>Créé le:</strong>{" "}
                                  {formatDate(product.createdAt)}
                                </div>
                                {product.updatedAt &&
                                  product.updatedAt !== product.createdAt && (
                                    <div>
                                      <strong>Modifié le:</strong>{" "}
                                      {formatDate(product.updatedAt)}
                                    </div>
                                  )}
                              </div>

                              {/* Product Images */}
                              <div className="md:col-span-2 space-y-3">
                                <h4 className="font-medium text-gray-900 mb-3">
                                  Images du produit
                                  {product.imageUrls &&
                                  product.imageUrls.length > 0
                                    ? ` (${product.imageUrls.length})`
                                    : " (aucune)"}
                                </h4>
                                {product.imageUrls &&
                                product.imageUrls.length > 0 ? (
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {product.imageUrls.map(
                                      (imageUrl, index) => (
                                        <div
                                          key={index}
                                          className="relative group bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:border-gray-300 transition-all duration-200"
                                        >
                                          <div className="aspect-square">
                                            <img
                                              src={imageUrl}
                                              alt={`${product.titre} - Image ${index + 1}`}
                                              className="w-full h-full object-cover cursor-pointer transition-transform duration-200 group-hover:scale-105"
                                              onClick={() =>
                                                window.open(imageUrl, "_blank")
                                              }
                                              onError={(e) => {
                                                e.target.src =
                                                  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y3ZjdmNyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTk5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub24gZGlzcG9uaWJsZTwvdGV4dD48L3N2Zz4=";
                                                e.target.classList.add(
                                                  "opacity-50"
                                                );
                                              }}
                                            />
                                          </div>

                                          {/* Overlay with image number */}
                                          <div className="absolute top-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1.5 py-0.5 rounded">
                                            {index + 1}
                                          </div>

                                          {/* Hover overlay */}
                                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                                            <div className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                              <svg
                                                className="w-6 h-6"
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
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center h-24 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                                    <div className="text-center">
                                      <svg
                                        className="mx-auto h-8 w-8 text-gray-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                        />
                                      </svg>
                                      <p className="text-sm text-gray-500 mt-1">
                                        Aucune image ajoutée
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Debug info for imageUrls - can be removed later */}
                              {process.env.NODE_ENV === "development" && (
                                <div className="md:col-span-2 text-xs text-gray-500 bg-yellow-50 p-2 rounded">
                                  <strong>Debug - ImageUrls:</strong>{" "}
                                  {JSON.stringify(product.imageUrls)}
                                  <br />
                                  <strong>Product ID:</strong>{" "}
                                  {product.productId}
                                  <br />
                                  <strong>Product Keys:</strong>{" "}
                                  {Object.keys(product).join(", ")}
                                </div>
                              )}
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
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <div className="flex flex-col items-center text-center">
              <div className="bg-red-100 p-3 rounded-full">
                <FaExclamationTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">
                Supprimer le produit
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Êtes-vous sûr de vouloir supprimer le produit "
                <strong>{productToDelete?.titre}</strong>"? Cette action est
                irréversible.
              </p>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Produits;
