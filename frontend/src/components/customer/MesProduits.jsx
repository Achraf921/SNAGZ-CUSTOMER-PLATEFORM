import React, { useState, useEffect, useMemo } from "react";
import {
  FaStore,
  FaShoppingBag,
  FaEdit,
  FaPlus,
  FaExclamationTriangle,
  FaCheckCircle,
  FaChevronDown,
  FaChevronRight,
  FaTrash,
  FaUpload,
  FaGripVertical,
  FaSave,
  FaTimes,
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
  const [expandedProducts, setExpandedProducts] = useState(new Set());
  const [draggedImageIndex, setDraggedImageIndex] = useState(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [deletingImage, setDeletingImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingField, setEditingField] = useState({}); // { productId: { field: value } }
  const [editingFieldName, setEditingFieldName] = useState({}); // { productId: fieldName }
  const [showEANValidationModal, setShowEANValidationModal] = useState(false);
  const [invalidEANs, setInvalidEANs] = useState([]);
  const [isEditingBasicFields, setIsEditingBasicFields] = useState({});

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
        const apiUrl = `/api/customer/shops/${userId}`;

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
      const apiUrl = `/api/customer/shops/${userId}/${shopId}/products`;

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
    setExpandedProducts(new Set()); // Reset expanded products when changing shop
    fetchProducts(shop.shopId);
  };

  const toggleProductExpansion = (productId) => {
    setExpandedProducts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // Image management functions
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleDeleteImage = async (productId, imageIndex) => {
    if (!selectedShop) return;

    setDeleteTarget({ productId, imageIndex });
    setShowDeleteModal(true);
  };

  const handleDeleteImageConfirm = async () => {
    if (!deleteTarget) return;

    const { productId, imageIndex } = deleteTarget;
    setDeletingImage(`${productId}-${imageIndex}`);

    try {
      const apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}/images/${imageIndex}`;

      const response = await fetch(apiUrl, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Erreur lors de la suppression de l'image"
        );
      }

      // Update the local state instead of refreshing the entire product list
      setProducts((prevProducts) =>
        prevProducts.map((p) => {
          if (p.productId === productId) {
            // Ensure imageUrls is always an array
            const currentImageUrls = p.imageUrls || [];
            const updatedImageUrls = currentImageUrls.filter(
              (_, idx) => idx !== imageIndex
            );
            return {
              ...p,
              imageUrls: updatedImageUrls,
            };
          }
          return p;
        })
      );
    } catch (error) {
      console.error("Error deleting image:", error);
      setError("Erreur lors de la suppression de l'image: " + error.message);
    } finally {
      setDeletingImage(null);
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const handleDeleteImageCancel = () => {
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  // Individual field editing functions
  const handleEditField = (productId, fieldName, currentValue) => {
    setEditingFieldName((prev) => ({ ...prev, [productId]: fieldName }));
    setEditingField((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [fieldName]: currentValue,
      },
    }));
  };

  const handleFieldChange = (productId, fieldName, value) => {
    setEditingField((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [fieldName]: value,
      },
    }));
  };

  const handleSaveField = async (productId, fieldName) => {
    if (!selectedShop) return;

    const newValue = editingField[productId]?.[fieldName];
    if (newValue === undefined) return;

    // Validate EANs if saving stock
    if (fieldName === "stock" && editingField[productId]?.eans) {
      const invalidEANs = validateAllEANs(productId);
      if (invalidEANs.length > 0) {
        setInvalidEANs(invalidEANs);
        setShowEANValidationModal(true);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}`;

      // Special handling for different field types
      let updateData = { [fieldName]: newValue };

      if (fieldName === "ean") {
        // Validate EAN
        if (newValue && !validateEAN(newValue)) {
          throw new Error("L'EAN doit contenir exactement 13 chiffres");
        }

        // Apply master EAN to all variants
        const masterEan = newValue || "";
        const eansData = { default: masterEan };

        // Find the current product to get its stock combinations
        const currentProduct = products.find((p) => p.productId === productId);
        if (
          currentProduct &&
          currentProduct.stock &&
          typeof currentProduct.stock === "object"
        ) {
          // Apply master EAN to all existing stock combinations
          Object.keys(currentProduct.stock).forEach((combination) => {
            eansData[combination] = masterEan;
          });
        }

        updateData = { eans: eansData };
      } else if (fieldName === "stock" && editingField[productId]?.eans) {
        // Clean EANs before saving
        const cleanedEANs = {};
        Object.entries(editingField[productId].eans).forEach(([key, ean]) => {
          cleanedEANs[key] = cleanEAN(ean);
        });
        updateData.eans = cleanedEANs;
      }

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Erreur lors de la mise à jour du champ"
        );
      }

      // Update local state
      setProducts((prevProducts) =>
        prevProducts.map((p) => {
          if (p.productId === productId) {
            let updatedProduct = { ...p, [fieldName]: newValue };
            // If saving stock and EAN was also updated, include EAN changes
            if (fieldName === "stock" && editingField[productId]?.eans) {
              const cleanedEANs = {};
              Object.entries(editingField[productId].eans).forEach(
                ([key, ean]) => {
                  cleanedEANs[key] = cleanEAN(ean);
                }
              );
              updatedProduct = {
                ...updatedProduct,
                eans: cleanedEANs,
              };
            }
            return updatedProduct;
          }
          return p;
        })
      );

      // Clear editing state
      setEditingFieldName((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
      setEditingField((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
    } catch (error) {
      console.error("Error updating field:", error);
      setError("Erreur lors de la mise à jour: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = (productId) => {
    setEditingFieldName((prev) => {
      const newState = { ...prev };
      delete newState[productId];
      return newState;
    });
    setEditingField((prev) => {
      const newState = { ...prev };
      delete newState[productId];
      return newState;
    });
  };

  // EAN validation functions
  const validateEAN = (ean) => {
    if (!ean || ean.trim() === "") return true; // Allow empty EANs
    if (ean === "0000000000000") return true; // Allow "no EAN" value
    const digitsOnly = ean.replace(/\D/g, "");
    return digitsOnly.length === 13;
  };

  const cleanEAN = (ean) => {
    if (!ean || ean.trim() === "") return "";
    return ean.replace(/\D/g, "");
  };

  const cleanPrice = (price) => {
    if (!price || price.toString().trim() === "") return 0;
    const cleaned = price.toString().replace(/[^\d.]/g, "");
    return parseFloat(cleaned) || 0;
  };

  const cleanWeight = (weight) => {
    if (!weight || weight.toString().trim() === "") return 0;
    const cleaned = weight.toString().replace(/[^\d.]/g, "");
    return parseFloat(cleaned) || 0;
  };

  const validateAllEANs = (productId) => {
    const eans = editingField[productId]?.eans;
    if (!eans) return [];

    const invalidEANs = [];

    // Check each EAN
    Object.entries(eans).forEach(([key, ean]) => {
      const cleanedEAN = cleanEAN(ean);
      if (!validateEAN(cleanedEAN)) {
        invalidEANs.push({
          key,
          ean,
          message: `EAN "${ean}" doit contenir exactement 13 chiffres`,
        });
      }
    });

    return invalidEANs;
  };

  // Handle master EAN changes - applies to all variants
  const handleMasterEANChange = (productId, value) => {
    // Keep only digits and limit to 13 characters
    const sanitized = value.replace(/\D/g, "").slice(0, 13);

    // Get current product to determine all variants
    const product = products.find((p) => p.productId === productId);
    if (!product) return;

    // Update all variant EANs with the master EAN
    const newEans = { ...editingField[productId]?.eans };

    // Set master EAN for default
    newEans.default = sanitized;

    // Set master EAN for all stock combinations
    if (product.stock && typeof product.stock === "object") {
      Object.keys(product.stock).forEach((combination) => {
        newEans[combination] = sanitized;
      });
    }

    handleFieldChange(productId, "eans", newEans);
  };

  const handleEANChange = (productId, combination, value) => {
    // Allow any input, only filter on blur or save to ensure normal textbox behavior
    const newEans = {
      ...editingField[productId]?.eans,
      [combination]: value,
    };
    handleFieldChange(productId, "eans", newEans);
  };

  const handlePriceChange = (productId, value) => {
    // Allow any input for normal textbox behavior
    handleFieldChange(productId, "price", value);
  };

  const handleWeightChange = (productId, value) => {
    // Allow any input for normal textbox behavior
    handleFieldChange(productId, "weight", value);
  };

  const handleEditBasicFields = (productId, product) => {
    setIsEditingBasicFields((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));

    if (!isEditingBasicFields[productId]) {
      // Enable editing for title, price, and weight simultaneously
      setEditingField((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          titre: product.titre || "",
          price: product.price || product.prix || 0,
          weight: product.weight || product.poids || "",
        },
      }));
      setEditingFieldName((prev) => ({
        ...prev,
        [productId]: "basicFields",
      }));
    } else {
      // Cancel editing
      setEditingField((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
      setEditingFieldName((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
      setIsEditingBasicFields((prev) => ({
        ...prev,
        [productId]: false,
      }));
    }
  };

  const handleSaveBasicFields = async (productId) => {
    if (!selectedShop) return;

    const editedData = editingField[productId];
    if (!editedData) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}`;

      const updateData = {
        titre: editedData.titre,
        price: cleanPrice(editedData.price),
        weight: cleanWeight(editedData.weight),
      };

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to update product");
      }

      const result = await response.json();
      if (result.success) {
        // Update local state
        setProducts((prevProducts) =>
          prevProducts.map((p) => {
            if (p.productId === productId) {
              return {
                ...p,
                titre: editedData.titre,
                price: cleanPrice(editedData.price),
                weight: cleanWeight(editedData.weight),
              };
            }
            return p;
          })
        );

        // Clear editing state
        setEditingField((prev) => {
          const newState = { ...prev };
          delete newState[productId];
          return newState;
        });
        setEditingFieldName((prev) => {
          const newState = { ...prev };
          delete newState[productId];
          return newState;
        });
        setIsEditingBasicFields((prev) => ({
          ...prev,
          [productId]: false,
        }));
      } else {
        throw new Error(result.message || "Failed to update product");
      }
    } catch (error) {
      console.error("Error updating product:", error);
      setError("Erreur lors de la mise à jour du produit");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = async (productId, files, replaceIndex = null) => {
    if (!selectedShop) return;

    setUploadingImages(true);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append("productImages", file);
      });

      let apiUrl;

      if (replaceIndex !== null) {
        // Use the new replace endpoint
        apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}/replace-image/${replaceIndex}`;
        console.log(
          `🔄 [IMAGE UPLOAD] Using REPLACE endpoint for index ${replaceIndex}`
        );
      } else {
        // Use the append endpoint
        apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}/upload-images`;
        console.log(`➕ [IMAGE UPLOAD] Using APPEND endpoint`);
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Erreur lors de l'upload des images"
        );
      }

      // Get the response data to update local state
      const responseData = await response.json();

      // Update the local state instead of refreshing the entire product list
      if (responseData.success) {
        if (replaceIndex !== null) {
          // REPLACE OPERATION: Update single image at specific index
          console.log(
            `🔄 [IMAGE UPLOAD] Processing replace response for index ${replaceIndex}`
          );

          // Generate signed URL for the replaced image
          const signedUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}/image-proxy?imageKey=${encodeURIComponent(responseData.s3Key)}`;

          setProducts((prevProducts) =>
            prevProducts.map((p) => {
              if (p.productId === productId) {
                // Ensure imageUrls is always an array
                const currentImageUrls = p.imageUrls || [];

                // Replace the image at the specified index
                const updatedImageUrls = [...currentImageUrls];
                updatedImageUrls[replaceIndex] = signedUrl;

                console.log(
                  `🔄 [IMAGE UPLOAD] Replaced image at index ${replaceIndex}`
                );
                console.log(
                  `🔄 [IMAGE UPLOAD] Updated image URLs:`,
                  updatedImageUrls
                );

                return {
                  ...p,
                  imageUrls: updatedImageUrls,
                };
              }
              return p;
            })
          );
        } else {
          // APPEND OPERATION: Add new images to existing ones
          console.log(`➕ [IMAGE UPLOAD] Processing append response`);

          // The backend returns full S3 URLs, but we need to extract the S3 keys and generate signed URLs
          const signedImageUrls = await Promise.all(
            responseData.imageUrls.map(async (fullS3Url) => {
              try {
                // Extract S3 key from the full URL
                const url = new URL(fullS3Url);
                const s3Key = url.pathname.substring(1); // Remove leading slash

                // Generate signed URL using the existing signed URL generation from the products fetch
                // We'll use the same approach as in the products fetch - just return the signed URL directly
                const signedUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}/image-proxy?imageKey=${encodeURIComponent(s3Key)}`;

                return signedUrl;
              } catch (error) {
                console.error("Error processing S3 URL:", error);
                return fullS3Url; // Fallback to original URL if processing fails
              }
            })
          );

          setProducts((prevProducts) =>
            prevProducts.map((p) => {
              if (p.productId === productId) {
                // Ensure imageUrls is always an array
                const currentImageUrls = p.imageUrls || [];

                // Append new images
                const updatedImageUrls = [
                  ...currentImageUrls,
                  ...signedImageUrls,
                ];

                console.log(
                  `➕ [IMAGE UPLOAD] Appended ${signedImageUrls.length} new images`
                );
                console.log(
                  `➕ [IMAGE UPLOAD] Updated image URLs:`,
                  updatedImageUrls
                );

                return {
                  ...p,
                  imageUrls: updatedImageUrls,
                };
              }
              return p;
            })
          );
        }
      }
    } catch (error) {
      console.error("Error uploading images:", error);
      setError("Erreur lors de l'upload des images: " + error.message);
    } finally {
      setUploadingImages(false);
    }
  };

  const handleDragStart = (e, imageIndex) => {
    setDraggedImageIndex(imageIndex);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, dropIndex, productId) => {
    e.preventDefault();

    if (draggedImageIndex === null || draggedImageIndex === dropIndex) {
      setDraggedImageIndex(null);
      return;
    }

    const product = products.find((p) => p.productId === productId);
    if (!product) return;

    // Ensure imageUrls is always an array
    const currentImageUrls = product.imageUrls || [];
    if (currentImageUrls.length === 0) return;

    // Create new order array
    const newOrder = [...currentImageUrls];
    const draggedImage = newOrder[draggedImageIndex];

    // Remove dragged item
    newOrder.splice(draggedImageIndex, 1);

    // Insert at new position
    newOrder.splice(dropIndex, 0, draggedImage);

    // Convert signed URLs back to S3 keys for the backend
    const convertToS3Keys = (urls) => {
      return urls.map((url) => {
        if (url.startsWith("https://")) {
          // Extract S3 key from signed URL
          try {
            const urlObj = new URL(url);
            return decodeURIComponent(urlObj.pathname.substring(1));
          } catch (e) {
            return url; // Return as-is if parsing fails
          }
        } else {
          // Already an S3 key
          return url;
        }
      });
    };

    const newOrderWithS3Keys = convertToS3Keys(newOrder);

    try {
      const apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${productId}/images/reorder`;

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOrder: newOrderWithS3Keys }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Erreur lors du réordonnancement des images"
        );
      }

      // Update the local state instead of refreshing the entire product list
      setProducts((prevProducts) =>
        prevProducts.map((p) => {
          if (p.productId === productId) {
            return {
              ...p,
              imageUrls: newOrder,
            };
          }
          return p;
        })
      );
    } catch (error) {
      console.error("Error reordering images:", error);
      setError("Erreur lors du réordonnancement des images: " + error.message);
    } finally {
      setDraggedImageIndex(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedImageIndex(null);
  };

  const handleEditProduct = (product) => {
    // Extract master EAN from the product's EAN data structure
    let masterEan = "";
    if (product.eans && typeof product.eans === "object") {
      // Try to get EAN from default or first available variant
      masterEan =
        product.eans.default ||
        product.eans[Object.keys(product.eans)[0]] ||
        "";
    } else if (product.ean) {
      // Handle simple EAN string or object
      masterEan =
        typeof product.ean === "object"
          ? product.ean.default ||
            product.ean[Object.keys(product.ean)[0]] ||
            ""
          : product.ean;
    }

    setEditingProduct(product.productId);
    setEditForm({
      ...product,
      ean: masterEan, // Set the master EAN for the form
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

      // Validate EAN before saving
      if (editForm.ean && !validateEAN(editForm.ean)) {
        throw new Error("L'EAN doit contenir exactement 13 chiffres");
      }

      // Prepare EAN data - apply master EAN to all variants
      const masterEan = editForm.ean || "";
      const eansData = {};

      // Set master EAN for default
      eansData.default = masterEan;

      // Find the current product to get its stock combinations
      const currentProduct = products.find(
        (p) => p.productId === editingProduct
      );
      if (
        currentProduct &&
        currentProduct.stock &&
        typeof currentProduct.stock === "object"
      ) {
        // Apply master EAN to all existing stock combinations
        Object.keys(currentProduct.stock).forEach((combination) => {
          eansData[combination] = masterEan;
        });
      }

      const productData = {
        ...editForm,
        price: parseFloat(editForm.price),
        weight: editForm.weight ? parseFloat(editForm.weight) : null,
        eans: eansData,
      };

      const apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${editingProduct}`;

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

  // Search function to filter products
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim() || !products) {
      return products;
    }

    const searchLower = searchTerm.toLowerCase().trim();

    return products.filter((product) => {
      // Search in title
      if (product.titre && product.titre.toLowerCase().includes(searchLower)) {
        return true;
      }

      // Search in description
      if (
        product.description &&
        product.description.toLowerCase().includes(searchLower)
      ) {
        return true;
      }

      // Search in product type
      if (
        product.typeProduit &&
        product.typeProduit.toLowerCase().includes(searchLower)
      ) {
        return true;
      }

      // Search in EAN
      if (
        product.ean &&
        String(product.ean).toLowerCase().includes(searchLower)
      ) {
        return true;
      }

      // Search in sizes
      if (
        product.sizes &&
        product.sizes.some((size) => size.toLowerCase().includes(searchLower))
      ) {
        return true;
      }

      // Search in colors
      if (
        product.colors &&
        product.colors.some((color) =>
          color.toLowerCase().includes(searchLower)
        )
      ) {
        return true;
      }

      // Search in price (exact match for numbers)
      if (product.price && String(product.price).includes(searchLower)) {
        return true;
      }

      // Search in weight
      if (product.weight && String(product.weight).includes(searchLower)) {
        return true;
      }

      return false;
    });
  }, [products, searchTerm]);

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
                        {filteredProducts.length} produit(s){" "}
                        {searchTerm && `sur ${products.length} total`}
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

                {/* Search Bar */}
                <div className="mt-4 relative">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Rechercher un produit par titre, description, type, EAN, taille, couleur..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-4 py-2 pl-10 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sna-primary focus:border-sna-primary"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400"
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
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                  {searchTerm && (
                    <div className="mt-2 text-sm text-gray-500">
                      {filteredProducts.length === 0 ? (
                        <span>Aucun produit trouvé pour "{searchTerm}"</span>
                      ) : (
                        <span>
                          {filteredProducts.length} produit(s) trouvé(s) pour "
                          {searchTerm}"
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-8">
                    <FaShoppingBag className="mx-auto text-gray-400 text-4xl mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-3">
                      {searchTerm
                        ? "Aucun produit trouvé"
                        : "Aucun produit dans cette boutique"}
                    </h3>
                    <p className="text-gray-600 mb-6">
                      {searchTerm
                        ? `Aucun produit ne correspond à votre recherche "${searchTerm}". Essayez avec d'autres termes.`
                        : "Commencez par ajouter votre premier produit à cette boutique."}
                    </p>
                    {!searchTerm && (
                      <a
                        href={`/client/produits/create?shopId=${selectedShop.shopId}`}
                        className="bg-sna-primary text-white px-6 py-3 rounded-md hover:bg-sna-primary-dark transition duration-300"
                      >
                        Créer un produit
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.productId}
                        className="border border-gray-200 rounded-lg hover:shadow-md transition-shadow duration-200"
                      >
                        {editingProduct === product.productId ? (
                          /* Edit Form */
                          <div className="p-4 space-y-4">
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
                                  EAN (appliqué à toutes les variantes)
                                </label>
                                <input
                                  type="text"
                                  value={editForm.ean || ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    // Allow empty string or sanitize to digits only (max 13)
                                    const sanitized =
                                      value === ""
                                        ? ""
                                        : value.replace(/\D/g, "").slice(0, 13);
                                    handleFormChange("ean", sanitized);
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                                  pattern="^\d{13}$"
                                  inputMode="numeric"
                                  placeholder="1234567890123"
                                  title="L'EAN doit contenir exactement 13 chiffres"
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                  13 chiffres exactement. Ce code sera utilisé
                                  pour toutes les variantes du produit.
                                </p>
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
                          /* Product Display with Dropdown */
                          <div>
                            {/* Product Header - Always Visible */}
                            <div
                              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors duration-200"
                              onClick={() =>
                                toggleProductExpansion(product.productId)
                              }
                            >
                              <div className="flex items-center space-x-3">
                                <div className="text-sna-primary">
                                  {expandedProducts.has(product.productId) ? (
                                    <FaChevronDown className="w-4 h-4" />
                                  ) : (
                                    <FaChevronRight className="w-4 h-4" />
                                  )}
                                </div>
                                {/* Product Image Preview */}
                                <div className="flex-shrink-0">
                                  {product.imageUrls &&
                                  product.imageUrls.length > 0 ? (
                                    <img
                                      src={product.imageUrls[0]}
                                      alt={`${product.titre} - Preview`}
                                      className="w-12 h-12 object-cover rounded-lg border"
                                      onError={(e) => {
                                        console.error(
                                          "Failed to load product preview image:",
                                          product.imageUrls[0]
                                        );
                                        // Show a placeholder instead of hiding the image
                                        e.target.src =
                                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%23f3f4f6'/%3E%3Ctext x='24' y='24' font-family='Arial' font-size='10' fill='%236b7280' text-anchor='middle' dy='.3em'%3EImage%3C/text%3E%3C/svg%3E";
                                        e.target.className =
                                          "w-12 h-12 object-cover rounded-lg border bg-gray-100";
                                      }}
                                    />
                                  ) : (
                                    <div className="w-12 h-12 bg-gray-100 rounded-lg border flex items-center justify-center">
                                      <FaShoppingBag className="w-5 h-5 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  {editingFieldName[product.productId] ===
                                  "basicFields" ? (
                                    <input
                                      type="text"
                                      value={
                                        editingField[product.productId]
                                          ?.titre !== undefined
                                          ? editingField[product.productId]
                                              .titre
                                          : product.titre || ""
                                      }
                                      onChange={(e) =>
                                        handleFieldChange(
                                          product.productId,
                                          "titre",
                                          e.target.value
                                        )
                                      }
                                      className="text-sm font-semibold px-2 py-1 mb-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-sna-primary w-48"
                                      autoFocus
                                    />
                                  ) : (
                                    <h3 className="text-lg font-semibold text-gray-800 group-hover:text-sna-primary transition-colors cursor-pointer">
                                      {product.titre || "Sans titre"}
                                    </h3>
                                  )}
                                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                                    <span className="flex items-center">
                                      Prix:{" "}
                                      {editingFieldName[product.productId] ===
                                      "basicFields" ? (
                                        <div className="flex items-center ml-1">
                                          <input
                                            type="text"
                                            value={
                                              editingField[product.productId]
                                                ?.price !== undefined
                                                ? editingField[
                                                    product.productId
                                                  ].price
                                                : product.price ||
                                                  product.prix ||
                                                  0
                                            }
                                            onChange={(e) =>
                                              handlePriceChange(
                                                product.productId,
                                                e.target.value
                                              )
                                            }
                                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-sna-primary"
                                          />
                                          <span className="ml-1">€</span>
                                        </div>
                                      ) : (
                                        <span className="ml-1">
                                          {(
                                            parseFloat(product.price) ||
                                            parseFloat(product.prix) ||
                                            0
                                          ).toFixed(2)}
                                          €
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex items-center">
                                      Type:{" "}
                                      {editingFieldName[product.productId] ===
                                      "typeProduit" ? (
                                        <div className="flex items-center ml-1">
                                          <input
                                            type="text"
                                            value={
                                              editingField[product.productId]
                                                ?.typeProduit ||
                                              product.typeProduit ||
                                              ""
                                            }
                                            onChange={(e) =>
                                              handleFieldChange(
                                                product.productId,
                                                "typeProduit",
                                                e.target.value
                                              )
                                            }
                                            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-sna-primary"
                                            autoFocus
                                          />
                                          <button
                                            onClick={() =>
                                              handleSaveField(
                                                product.productId,
                                                "typeProduit"
                                              )
                                            }
                                            className="ml-1 text-green-600 hover:text-green-800"
                                            disabled={isSubmitting}
                                          >
                                            ✓
                                          </button>
                                          <button
                                            onClick={() =>
                                              handleCancelEdit(
                                                product.productId
                                              )
                                            }
                                            className="ml-1 text-red-600 hover:text-red-800"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="ml-1">
                                          {product.typeProduit}
                                        </span>
                                      )}
                                    </span>
                                    {(product.weight ||
                                      product.poids ||
                                      editingFieldName[product.productId] ===
                                        "basicFields") && (
                                      <span className="flex items-center">
                                        Poids:{" "}
                                        {editingFieldName[product.productId] ===
                                        "basicFields" ? (
                                          <div className="flex items-center ml-1">
                                            <input
                                              type="text"
                                              value={
                                                editingField[product.productId]
                                                  ?.weight !== undefined
                                                  ? editingField[
                                                      product.productId
                                                    ].weight
                                                  : product.weight ||
                                                    product.poids ||
                                                    ""
                                              }
                                              onChange={(e) =>
                                                handleWeightChange(
                                                  product.productId,
                                                  e.target.value
                                                )
                                              }
                                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-sna-primary"
                                            />
                                            <span className="ml-1">g</span>
                                          </div>
                                        ) : (
                                          <span className="ml-1">
                                            {product.weight || product.poids}g
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {editingFieldName[product.productId] ===
                                "basicFields" ? (
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSaveBasicFields(
                                          product.productId
                                        );
                                      }}
                                      className="text-green-600 hover:text-green-800 p-2 rounded-full hover:bg-green-50 transition-colors"
                                      disabled={isSubmitting}
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditBasicFields(
                                          product.productId,
                                          product
                                        );
                                      }}
                                      className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : expandedProducts.has(product.productId) ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditBasicFields(
                                        product.productId,
                                        product
                                      );
                                    }}
                                    className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                                  >
                                    <FaEdit className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {/* Product Details - Expandable */}
                            {expandedProducts.has(product.productId) && (
                              <div className="px-4 pb-4 border-t border-gray-100">
                                <div className="mb-3 mt-3">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-gray-700">
                                      Description:
                                    </span>
                                    {editingFieldName[product.productId] ===
                                    "description" ? (
                                      <div className="flex items-center space-x-1">
                                        <button
                                          onClick={() =>
                                            handleSaveField(
                                              product.productId,
                                              "description"
                                            )
                                          }
                                          className="text-green-600 hover:text-green-800 text-sm p-1"
                                          disabled={isSubmitting}
                                          title="Sauvegarder"
                                        >
                                          <FaSave className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleCancelEdit(product.productId)
                                          }
                                          className="text-red-600 hover:text-red-800 text-sm p-1"
                                          title="Annuler"
                                        >
                                          <FaTimes className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          handleEditField(
                                            product.productId,
                                            "description",
                                            product.description || ""
                                          )
                                        }
                                        className="text-blue-600 hover:text-blue-800 text-sm"
                                      >
                                        <FaEdit className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  {editingFieldName[product.productId] ===
                                  "description" ? (
                                    <textarea
                                      value={
                                        editingField[product.productId]
                                          ?.description !== undefined
                                          ? editingField[product.productId]
                                              .description
                                          : product.description || ""
                                      }
                                      onChange={(e) =>
                                        handleFieldChange(
                                          product.productId,
                                          "description",
                                          e.target.value
                                        )
                                      }
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary text-sm"
                                      rows="3"
                                      autoFocus
                                    />
                                  ) : (
                                    <p className="text-gray-600">
                                      {product.description ||
                                        "Aucune description"}
                                    </p>
                                  )}
                                </div>

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
                                    {product.sizes &&
                                      product.sizes.length > 0 && (
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

                                    {/* EAN Section - Always show */}
                                    {true && (
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium text-gray-700">
                                            EAN:
                                          </span>
                                          {editingFieldName[
                                            product.productId
                                          ] === "ean" ? (
                                            <div className="flex items-center space-x-1">
                                              <button
                                                onClick={() =>
                                                  handleSaveField(
                                                    product.productId,
                                                    "ean"
                                                  )
                                                }
                                                className="text-green-600 hover:text-green-800 text-sm p-1"
                                                disabled={isSubmitting}
                                                title="Sauvegarder"
                                              >
                                                <FaSave className="w-3 h-3" />
                                              </button>
                                              <button
                                                onClick={() =>
                                                  handleCancelEdit(
                                                    product.productId
                                                  )
                                                }
                                                className="text-red-600 hover:text-red-800 text-sm p-1"
                                                title="Annuler"
                                              >
                                                <FaTimes className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                // Extract current master EAN for editing
                                                const currentEan = (() => {
                                                  if (
                                                    product.eans &&
                                                    typeof product.eans ===
                                                      "object"
                                                  ) {
                                                    return (
                                                      product.eans.default ||
                                                      product.eans[
                                                        Object.keys(
                                                          product.eans
                                                        )[0]
                                                      ] ||
                                                      ""
                                                    );
                                                  } else if (product.ean) {
                                                    return typeof product.ean ===
                                                      "object"
                                                      ? product.ean.default ||
                                                          product.ean[
                                                            Object.keys(
                                                              product.ean
                                                            )[0]
                                                          ] ||
                                                          ""
                                                      : product.ean;
                                                  }
                                                  return "";
                                                })();
                                                handleEditField(
                                                  product.productId,
                                                  "ean",
                                                  currentEan
                                                );
                                              }}
                                              className="text-blue-600 hover:text-blue-800 text-sm"
                                            >
                                              <FaEdit className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                        {editingFieldName[product.productId] ===
                                        "ean" ? (
                                          <input
                                            type="text"
                                            value={
                                              editingField[product.productId]
                                                ?.ean !== undefined
                                                ? editingField[
                                                    product.productId
                                                  ].ean
                                                : (() => {
                                                    // Extract current master EAN for editing
                                                    if (
                                                      product.eans &&
                                                      typeof product.eans ===
                                                        "object"
                                                    ) {
                                                      return (
                                                        product.eans.default ||
                                                        product.eans[
                                                          Object.keys(
                                                            product.eans
                                                          )[0]
                                                        ] ||
                                                        ""
                                                      );
                                                    } else if (product.ean) {
                                                      return typeof product.ean ===
                                                        "object"
                                                        ? product.ean.default ||
                                                            product.ean[
                                                              Object.keys(
                                                                product.ean
                                                              )[0]
                                                            ] ||
                                                            ""
                                                        : product.ean;
                                                    }
                                                    return "";
                                                  })()
                                            }
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              // Allow empty string or sanitize to digits only (max 13)
                                              const sanitized =
                                                value === ""
                                                  ? ""
                                                  : value
                                                      .replace(/\D/g, "")
                                                      .slice(0, 13);
                                              handleFieldChange(
                                                product.productId,
                                                "ean",
                                                sanitized
                                              );
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary text-sm mt-1"
                                            pattern="^\d{13}$"
                                            inputMode="numeric"
                                            placeholder="1234567890123"
                                            title="L'EAN doit contenir exactement 13 chiffres"
                                            autoFocus
                                          />
                                        ) : (
                                          <div className="text-gray-600 mt-1">
                                            {(() => {
                                              // Extract master EAN for display
                                              if (
                                                product.eans &&
                                                typeof product.eans === "object"
                                              ) {
                                                return (
                                                  product.eans.default ||
                                                  product.eans[
                                                    Object.keys(product.eans)[0]
                                                  ] ||
                                                  "Non défini"
                                                );
                                              } else if (product.ean) {
                                                return typeof product.ean ===
                                                  "object"
                                                  ? product.ean.default ||
                                                      product.ean[
                                                        Object.keys(
                                                          product.ean
                                                        )[0]
                                                      ] ||
                                                      "Non défini"
                                                  : product.ean;
                                              }
                                              return "Non défini";
                                            })()}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Stock Information */}
                                  {product.stock &&
                                    Object.keys(product.stock).length > 0 && (
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium text-gray-700">
                                            Stock:
                                          </span>
                                          {editingFieldName[
                                            product.productId
                                          ] === "stock" ? (
                                            <div className="flex items-center space-x-1">
                                              <button
                                                onClick={() =>
                                                  handleSaveField(
                                                    product.productId,
                                                    "stock"
                                                  )
                                                }
                                                className="text-green-600 hover:text-green-800 text-sm p-1"
                                                disabled={isSubmitting}
                                                title="Sauvegarder"
                                              >
                                                <FaSave className="w-3 h-3" />
                                              </button>
                                              <button
                                                onClick={() =>
                                                  handleCancelEdit(
                                                    product.productId
                                                  )
                                                }
                                                className="text-red-600 hover:text-red-800 text-sm p-1"
                                                title="Annuler"
                                              >
                                                <FaTimes className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() =>
                                                handleEditField(
                                                  product.productId,
                                                  "stock",
                                                  product.stock
                                                )
                                              }
                                              className="text-blue-600 hover:text-blue-800 text-sm"
                                            >
                                              <FaEdit className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                        <div className="mt-2">
                                          {Object.keys(product.stock).length ===
                                            1 &&
                                          product.stock.default !==
                                            undefined ? (
                                            // Simple stock
                                            <div className="text-gray-600">
                                              {editingFieldName[
                                                product.productId
                                              ] === "stock" ? (
                                                <div className="flex items-center space-x-2">
                                                  <input
                                                    type="text"
                                                    value={
                                                      editingField[
                                                        product.productId
                                                      ]?.stock?.default !==
                                                      undefined
                                                        ? editingField[
                                                            product.productId
                                                          ].stock.default
                                                        : product.stock.default
                                                    }
                                                    onChange={(e) =>
                                                      handleFieldChange(
                                                        product.productId,
                                                        "stock",
                                                        {
                                                          default:
                                                            e.target.value,
                                                        }
                                                      )
                                                    }
                                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-sna-primary"
                                                    autoFocus
                                                  />
                                                  <span>unités</span>
                                                </div>
                                              ) : (
                                                <div>
                                                  <span className="font-semibold text-sna-primary">
                                                    {product.stock.default}
                                                  </span>{" "}
                                                  unités
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            // Stock by combinations
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                              {Object.entries(
                                                product.stock
                                              ).map(
                                                ([combination, quantity]) => (
                                                  <div
                                                    key={combination}
                                                    className="bg-gray-100 px-3 py-2 rounded"
                                                  >
                                                    <div className="flex justify-between items-center mb-1">
                                                      <span className="text-sm text-gray-700 font-medium">
                                                        {combination}
                                                      </span>
                                                      {editingFieldName[
                                                        product.productId
                                                      ] === "stock" ? (
                                                        <input
                                                          type="text"
                                                          value={
                                                            editingField[
                                                              product.productId
                                                            ]?.stock?.[
                                                              combination
                                                            ] !== undefined
                                                              ? editingField[
                                                                  product
                                                                    .productId
                                                                ].stock[
                                                                  combination
                                                                ]
                                                              : quantity
                                                          }
                                                          onChange={(e) => {
                                                            const newStock = {
                                                              ...editingField[
                                                                product
                                                                  .productId
                                                              ]?.stock,
                                                              [combination]:
                                                                e.target.value,
                                                            };
                                                            handleFieldChange(
                                                              product.productId,
                                                              "stock",
                                                              newStock
                                                            );
                                                          }}
                                                          className="w-16 px-1 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-sna-primary"
                                                        />
                                                      ) : (
                                                        <span className="font-semibold text-sna-primary">
                                                          {quantity}
                                                        </span>
                                                      )}
                                                    </div>
                                                    {/* EAN and SKU for each variant */}
                                                    <div className="text-xs text-gray-500 space-y-1">
                                                      {/* Check multiple possible data structures for EAN and SKU */}
                                                      {(() => {
                                                        // Try different possible data structures
                                                        const variantData =
                                                          product.variants?.[
                                                            combination
                                                          ] ||
                                                          product.skus?.[
                                                            combination
                                                          ] ||
                                                          product.eans?.[
                                                            combination
                                                          ];

                                                        const ean =
                                                          variantData?.ean ||
                                                          product.eans?.[
                                                            combination
                                                          ] ||
                                                          product.ean?.[
                                                            combination
                                                          ];

                                                        const sku =
                                                          variantData?.sku ||
                                                          product.skus?.[
                                                            combination
                                                          ] ||
                                                          product.sku?.[
                                                            combination
                                                          ];

                                                        return (
                                                          <>
                                                            {sku && (
                                                              <div className="flex items-center">
                                                                <span
                                                                  className="mr-1"
                                                                  style={{
                                                                    fontSize:
                                                                      "10px",
                                                                  }}
                                                                >
                                                                  SKU:
                                                                </span>
                                                                <span
                                                                  style={{
                                                                    fontSize:
                                                                      "10px",
                                                                  }}
                                                                >
                                                                  {sku}
                                                                </span>
                                                              </div>
                                                            )}
                                                          </>
                                                        );
                                                      })()}
                                                    </div>
                                                  </div>
                                                )
                                              )}
                                            </div>
                                          )}
                                          <div className="mt-2 text-sm text-gray-500">
                                            Total:{" "}
                                            <span className="font-semibold text-sna-primary">
                                              {Object.values(
                                                editingFieldName[
                                                  product.productId
                                                ] === "stock"
                                                  ? editingField[
                                                      product.productId
                                                    ]?.stock || product.stock
                                                  : product.stock
                                              ).reduce(
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

                                {/* Product Images - Moved to bottom */}
                                <div className="mt-6 pt-6 border-t border-gray-200">
                                  <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-sm font-medium text-gray-700">
                                      Images du produit (
                                      {(product.imageUrls &&
                                        product.imageUrls.length) ||
                                        0}
                                      )
                                    </h4>
                                    <div className="flex items-center space-x-2">
                                      <label
                                        className={`px-3 py-1 rounded-md text-sm transition-colors ${
                                          (product.imageUrls &&
                                            product.imageUrls.length >= 5) ||
                                          uploadingImages
                                            ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                                            : "bg-sna-primary text-white hover:bg-sna-primary-dark cursor-pointer"
                                        }`}
                                      >
                                        <FaUpload className="inline mr-1" />
                                        Ajouter des images
                                        <input
                                          type="file"
                                          multiple
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            if (e.target.files.length > 0) {
                                              handleImageUpload(
                                                product.productId,
                                                e.target.files
                                              );
                                            }
                                          }}
                                          disabled={
                                            uploadingImages ||
                                            (product.imageUrls &&
                                              product.imageUrls.length >= 5)
                                          }
                                        />
                                      </label>
                                    </div>
                                  </div>

                                  {uploadingImages && (
                                    <div className="mb-3 p-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                                      <div className="flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
                                        Upload des images en cours...
                                      </div>
                                    </div>
                                  )}

                                  {product.imageUrls &&
                                  product.imageUrls.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                      {product.imageUrls.map(
                                        (imageUrl, index) => (
                                          <div
                                            key={index}
                                            className={`relative group ${
                                              draggedImageIndex === index
                                                ? "opacity-50"
                                                : ""
                                            }`}
                                            draggable
                                            onDragStart={(e) =>
                                              handleDragStart(e, index)
                                            }
                                            onDragOver={handleDragOver}
                                            onDrop={(e) =>
                                              handleDrop(
                                                e,
                                                index,
                                                product.productId
                                              )
                                            }
                                            onDragEnd={handleDragEnd}
                                          >
                                            <div className="absolute top-1 left-1 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
                                              {index + 1}
                                            </div>
                                            <img
                                              src={imageUrl}
                                              alt={`${product.titre} - Image ${index + 1}`}
                                              className="w-full h-24 object-cover rounded-lg border cursor-move transition-transform hover:scale-105"
                                              onError={(e) => {
                                                console.error(
                                                  `Failed to load product image ${index + 1}:`,
                                                  imageUrl
                                                );
                                                // Show a placeholder instead of hiding the image
                                                e.target.src =
                                                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='12' fill='%236b7280' text-anchor='middle' dy='.3em'%3EImage%3C/text%3E%3C/svg%3E";
                                                e.target.className =
                                                  "w-full h-24 object-cover rounded-lg border bg-gray-100";
                                              }}
                                            />
                                            <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                                              <button
                                                className="bg-white text-gray-800 p-1 rounded hover:bg-gray-100"
                                                title="Télécharger"
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  try {
                                                    // Extract S3 key from the signed URL
                                                    const urlParts =
                                                      imageUrl.split("/");
                                                    const s3Key = urlParts
                                                      .slice(3)
                                                      .join("/")
                                                      .split("?")[0];

                                                    // Use the existing image proxy endpoint
                                                    const proxyUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products/${product.productId}/image-proxy?imageKey=${encodeURIComponent(s3Key)}`;

                                                    const response =
                                                      await fetch(proxyUrl, {
                                                        credentials: "include",
                                                      });

                                                    if (!response.ok) {
                                                      throw new Error(
                                                        `Failed to download image: ${response.status}`
                                                      );
                                                    }

                                                    const blob =
                                                      await response.blob();
                                                    const url =
                                                      window.URL.createObjectURL(
                                                        blob
                                                      );
                                                    const link =
                                                      document.createElement(
                                                        "a"
                                                      );
                                                    link.href = url;
                                                    link.download = `${product.titre}-image-${index + 1}.jpg`;
                                                    document.body.appendChild(
                                                      link
                                                    );
                                                    link.click();
                                                    document.body.removeChild(
                                                      link
                                                    );
                                                    window.URL.revokeObjectURL(
                                                      url
                                                    );
                                                  } catch (error) {
                                                    console.error(
                                                      "Error downloading image:",
                                                      error
                                                    );
                                                  }
                                                }}
                                              >
                                                <svg
                                                  className="w-4 h-4"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                  />
                                                </svg>
                                              </button>
                                              <label
                                                className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700 cursor-pointer"
                                                title="Remplacer"
                                              >
                                                <FaUpload className="w-4 h-4" />
                                                <input
                                                  type="file"
                                                  accept="image/*"
                                                  className="hidden"
                                                  onChange={(e) => {
                                                    if (
                                                      e.target.files.length > 0
                                                    ) {
                                                      handleImageUpload(
                                                        product.productId,
                                                        e.target.files,
                                                        index
                                                      );
                                                    }
                                                  }}
                                                  disabled={uploadingImages}
                                                />
                                              </label>
                                              <button
                                                className="bg-red-600 text-white p-1 rounded hover:bg-red-700"
                                                title="Supprimer"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteImage(
                                                    product.productId,
                                                    index
                                                  );
                                                }}
                                                disabled={
                                                  deletingImage ===
                                                  `${product.productId}-${index}`
                                                }
                                              >
                                                {deletingImage ===
                                                `${product.productId}-${index}` ? (
                                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                ) : (
                                                  <FaTrash className="w-4 h-4" />
                                                )}
                                              </button>
                                            </div>
                                            <div className="absolute bottom-1 left-1 right-1 bg-black bg-opacity-70 text-white text-xs text-center rounded">
                                              <FaGripVertical className="inline mr-1" />
                                              Glisser pour réorganiser
                                            </div>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 text-gray-500">
                                      <FaUpload className="mx-auto text-4xl mb-2" />
                                      <p>Aucune image pour ce produit</p>
                                      <p className="text-sm">
                                        Cliquez sur "Ajouter des images" pour
                                        commencer
                                      </p>
                                    </div>
                                  )}
                                </div>

                                <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                                  Créé le:{" "}
                                  {new Date(
                                    product.createdAt
                                  ).toLocaleDateString("fr-FR")}
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirmer la suppression
            </h3>
            <p className="text-gray-600 mb-6">
              Êtes-vous sûr de vouloir supprimer cette image ? Cette action est
              irréversible.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleDeleteImageCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteImageConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EAN Validation Modal */}
      {showEANValidationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-red-600 mb-4">
              Validation EAN requise
            </h3>
            <p className="text-gray-600 mb-4">
              Les codes EAN doivent contenir exactement 13 chiffres. Veuillez
              corriger les erreurs suivantes :
            </p>
            <div className="mb-6 max-h-40 overflow-y-auto">
              {invalidEANs.map((invalidEAN, index) => (
                <div
                  key={index}
                  className="text-sm text-red-600 mb-2 p-2 bg-red-50 rounded"
                >
                  <strong>EAN "{invalidEAN.ean}":</strong> {invalidEAN.message}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowEANValidationModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MesProduits;
