import React, { useState, useEffect } from "react";
import { FaEdit, FaSave, FaTimes, FaSearch } from "react-icons/fa";

const Produits = () => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState({});
  const [editingField, setEditingField] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

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

    const currentValue =
      getFieldValue(product, fieldName, fieldName) || product[fieldName];
    setEditForm({
      [fieldName]: currentValue,
    });
  };

  const handleFieldCancel = () => {
    setEditingField(null);
    setEditForm({});
  };

  const handleFieldSave = async (product, fieldName) => {
    try {
      setSaving(true);

      const response = await fetch(
        `/api/internal/products/${product.clientId}/${product.shopId}/${product.productId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ [fieldName]: editForm[fieldName] }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setProducts((prevProducts) =>
          prevProducts.map((p) =>
            p.productId === product.productId
              ? {
                  ...p,
                  [fieldName]: editForm[fieldName],
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
      codeEAN: "ean",
      tailles: "sizes",
      couleurs: "colors",
    };

    const englishFieldName = fieldMapping[fieldName] || fieldName;
    const currentValue =
      getFieldValue(product, fieldName, englishFieldName) || product[fieldName];

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
    <div className="container mx-auto p-4">
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
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {product.titre || "-"}
                        </div>
                        {product.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {product.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {product.clientName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {product.shopName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
                                  fieldName="codeEAN"
                                  label="Code EAN"
                                  type="text"
                                />
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
  );
};

export default Produits;
