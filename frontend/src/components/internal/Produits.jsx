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
  const [tempInputValue, setTempInputValue] = useState(""); // Temporary value for better performance
  const [saving, setSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  // Image management state
  const [draggedImageIndex, setDraggedImageIndex] = useState(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [replacingImageIndex, setReplacingImageIndex] = useState(null);
  const [deletingImageIndex, setDeletingImageIndex] = useState(null);
  const [addingImage, setAddingImage] = useState(null); // Track which product is adding an image
  const [deleteImageModal, setDeleteImageModal] = useState({
    show: false,
    productId: null,
    imageIndex: null,
  });

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
          credentials: "include",
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

  // Image drag and drop handlers
  const handleDragStart = (e, imageIndex) => {
    setDraggedImageIndex(imageIndex);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, dropIndex, product) => {
    e.preventDefault();

    if (draggedImageIndex === null || draggedImageIndex === dropIndex) {
      setDraggedImageIndex(null);
      return;
    }

    const currentImageUrls = product.imageUrls || [];
    if (currentImageUrls.length === 0) return;

    // Create new order array
    const newOrder = [...currentImageUrls];
    const draggedImage = newOrder[draggedImageIndex];

    // Remove dragged item
    newOrder.splice(draggedImageIndex, 1);

    // Insert at new position
    newOrder.splice(dropIndex, 0, draggedImage);

    try {
      // Convert signed URLs back to S3 keys for the backend
      const convertToS3Keys = (urls) => {
        return urls.map((url) => {
          if (url.startsWith("https://")) {
            try {
              const urlObj = new URL(url);
              return decodeURIComponent(urlObj.pathname.substring(1));
            } catch (e) {
              return url;
            }
          } else {
            return url;
          }
        });
      };

      const newOrderWithS3Keys = convertToS3Keys(newOrder);

      // Call the internal API endpoint for image reordering
      const apiUrl = `/api/internal/products/${product.clientId}/${product.shopId}/${product.productId}/images/reorder`;

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

      console.log("Successfully reordered images");

      // Update local state
      setProducts((prevProducts) =>
        prevProducts.map((p) => {
          if (p.productId === product.productId) {
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

  // Image download handler
  const handleDownloadImage = async (
    imageUrl,
    productTitle,
    imageIndex,
    product
  ) => {
    try {
      // Extract S3 key from the signed URL to create a proxy URL
      let proxyUrl;

      if (imageUrl.startsWith("https://")) {
        try {
          const urlObj = new URL(imageUrl);
          const s3Key = decodeURIComponent(urlObj.pathname.substring(1));

          // Use internal proxy endpoint (you'll need to create this)
          proxyUrl = `/api/internal/image-proxy?imageKey=${encodeURIComponent(s3Key)}`;
        } catch (e) {
          console.error("Failed to parse S3 URL:", e);
          proxyUrl = imageUrl; // Fallback to original URL
        }
      } else {
        // Already an S3 key
        proxyUrl = `/api/internal/image-proxy?imageKey=${encodeURIComponent(imageUrl)}`;
      }

      const response = await fetch(proxyUrl, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();

      // Create download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;

      // Get file extension from URL or default to jpg
      const extension =
        imageUrl.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
      const filename = `${productTitle || "product"}_image_${imageIndex + 1}.${extension}`;

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Error downloading image:", error);
      setError("Erreur lors du téléchargement de l'image");
    }
  };

  // Image replace handler
  const handleReplaceImage = (productId, imageIndex) => {
    setReplacingImageIndex(`${productId}-${imageIndex}`);

    // Create file input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        handleImageReplace(productId, imageIndex, file);
      }
      setReplacingImageIndex(null);
    };
    input.click();
  };

  const handleImageReplace = async (productId, imageIndex, file) => {
    try {
      setUploadingImages(true);
      setReplacingImageIndex(`${productId}-${imageIndex}`);

      console.log("🔄 [IMAGE REPLACE] Starting image replacement");
      console.log("📁 [IMAGE DEBUG] File details:", {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      });

      // Find the product to get client and shop IDs
      const product = products.find((p) => p.productId === productId);
      if (!product) {
        throw new Error("Product not found");
      }

      const { clientId, shopId } = product;
      const oldImageUrl = product.imageUrls[imageIndex];

      console.log("🎯 [IMAGE DEBUG] Request details:", {
        clientId,
        shopId,
        productId,
        imageIndex,
        oldImageUrl,
      });

      // Step 1: Upload new image
      const formData = new FormData();
      formData.append("image", file);

      // Debug FormData contents
      console.log("📦 [IMAGE DEBUG] FormData contents:");
      for (let [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(
            `  ${key}: File(${value.name}, ${value.type}, ${value.size} bytes)`
          );
        } else {
          // Security: Removed potentially sensitive form data logging
        }
      }

      const uploadUrl = `/api/internal/upload/products/${clientId}/${shopId}/${productId}/images/${imageIndex}/upload`;
      console.log("🌐 [IMAGE DEBUG] Upload URL:", uploadUrl);
      console.log("📤 [IMAGE REPLACE] Uploading new image...");

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include", // Required for session authentication
      });

      console.log(
        "📥 [IMAGE DEBUG] Upload response status:",
        uploadResponse.status
      );
      console.log(
        "📥 [IMAGE DEBUG] Upload response headers:",
        Object.fromEntries(uploadResponse.headers.entries())
      );

      if (!uploadResponse.ok) {
        console.log("❌ [IMAGE DEBUG] Upload failed, response text:");
        const responseText = await uploadResponse.text();
        console.log("📄 [IMAGE DEBUG] Raw response:", responseText);

        let errorData;
        try {
          errorData = JSON.parse(responseText);
          console.log("📊 [IMAGE DEBUG] Parsed error data:", errorData);
        } catch (parseError) {
          console.log(
            "⚠️ [IMAGE DEBUG] Failed to parse error response as JSON:",
            parseError
          );
          throw new Error(`File upload error: ${responseText}`);
        }

        throw new Error(errorData.message || "Failed to upload new image");
      }

      const uploadResult = await uploadResponse.json();
      console.log(
        "✅ [IMAGE REPLACE] New image uploaded:",
        uploadResult.imageUrl
      );

      // Step 2: Replace image in database
      console.log("🔄 [IMAGE REPLACE] Replacing image in database...");
      const replaceResponse = await fetch(
        `/api/internal/products/${clientId}/${shopId}/${productId}/images/${imageIndex}/replace`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newImageUrl: uploadResult.imageUrl,
            oldImageUrl: oldImageUrl,
          }),
          credentials: "include",
        }
      );

      if (!replaceResponse.ok) {
        const errorData = await replaceResponse.json();
        throw new Error(errorData.message || "Failed to replace image");
      }

      const replaceResult = await replaceResponse.json();
      console.log("✅ [IMAGE REPLACE] Image replaced successfully");

      // Step 3: Update local state
      setProducts((prevProducts) =>
        prevProducts.map((p) =>
          p.productId === productId
            ? { ...p, imageUrls: replaceResult.updatedImageUrls }
            : p
        )
      );

      setError(null);
      console.log(
        "🎉 [IMAGE REPLACE] Image replacement completed successfully"
      );
    } catch (error) {
      console.error("❌ [IMAGE REPLACE] Error replacing image:", error);
      setError("Erreur lors du remplacement de l'image: " + error.message);
    } finally {
      setUploadingImages(false);
      setReplacingImageIndex(null);
    }
  };

  // Function to handle adding a new image
  const handleAddImage = (productId) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        handleImageAdd(productId, file);
      }
    };
    input.click();
  };

  // Function to add a new image to a product
  const handleImageAdd = async (productId, file) => {
    try {
      setAddingImage(productId);
      console.log("🔄 [IMAGE ADD] Starting image addition");
      console.log("📁 [IMAGE ADD] File details:", {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      const product = products.find((p) => p.productId === productId);
      if (!product) {
        throw new Error("Product not found");
      }

      const { clientId, shopId } = product;
      const currentImageCount = product.imageUrls
        ? product.imageUrls.length
        : 0;

      // Check if we're at the 5 image limit
      if (currentImageCount >= 5) {
        throw new Error("Limite de 5 images atteinte pour ce produit");
      }

      // Step 1: Upload new image
      const formData = new FormData();
      formData.append("image", file);

      const nextIndex = currentImageCount; // New image will be at the end
      const uploadUrl = `/api/internal/upload/products/${clientId}/${shopId}/${productId}/images/${nextIndex}/upload`;

      console.log("🌐 [IMAGE ADD] Upload URL:", uploadUrl);
      console.log("📤 [IMAGE ADD] Uploading new image...");

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      console.log(
        "📥 [IMAGE ADD] Upload response status:",
        uploadResponse.status
      );

      if (!uploadResponse.ok) {
        const responseText = await uploadResponse.text();
        console.log("📄 [IMAGE ADD] Raw response:", responseText);

        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(`File upload error: ${responseText}`);
        }

        throw new Error(errorData.message || "Failed to upload new image");
      }

      const uploadResult = await uploadResponse.json();
      console.log("✅ [IMAGE ADD] New image uploaded:", uploadResult.imageUrl);

      // Step 2: Add image to database (append to imageUrls array)
      const addResponse = await fetch(
        `/api/internal/products/${clientId}/${shopId}/${productId}/images/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newImageUrl: uploadResult.imageUrl,
          }),
          credentials: "include",
        }
      );

      if (!addResponse.ok) {
        const errorData = await addResponse.json();
        throw new Error(errorData.message || "Failed to add image");
      }

      const addResult = await addResponse.json();
      console.log("✅ [IMAGE ADD] Image added successfully");

      // Step 3: Update local state
      setProducts((prevProducts) =>
        prevProducts.map((p) =>
          p.productId === productId
            ? { ...p, imageUrls: addResult.updatedImageUrls }
            : p
        )
      );

      setError(null);
      console.log("🎉 [IMAGE ADD] Image addition completed successfully");
    } catch (error) {
      console.error("❌ [IMAGE ADD] Error adding image:", error);
      setError("Erreur lors de l'ajout de l'image: " + error.message);
    } finally {
      setAddingImage(null);
    }
  };

  // Function to show delete image modal
  const showDeleteImageModal = (productId, imageIndex) => {
    setDeleteImageModal({
      show: true,
      productId,
      imageIndex,
    });
  };

  // Function to handle confirmed deletion
  const handleConfirmDeleteImage = async () => {
    const { productId, imageIndex } = deleteImageModal;
    setDeleteImageModal({ show: false, productId: null, imageIndex: null });
    await handleDeleteImage(productId, imageIndex);
  };

  // Function to cancel deletion
  const handleCancelDeleteImage = () => {
    setDeleteImageModal({ show: false, productId: null, imageIndex: null });
  };

  // Function to handle deleting an image
  const handleDeleteImage = async (productId, imageIndex) => {
    try {
      setDeletingImageIndex(`${productId}-${imageIndex}`);
      console.log("🗑️ [IMAGE DELETE] Starting image deletion");

      const product = products.find((p) => p.productId === productId);
      if (!product) {
        throw new Error("Product not found");
      }

      const { clientId, shopId } = product;
      const imageUrl = product.imageUrls[imageIndex];

      console.log("🎯 [IMAGE DELETE] Delete details:", {
        clientId,
        shopId,
        productId,
        imageIndex,
        imageUrl,
      });

      // Call backend to delete image
      const deleteResponse = await fetch(
        `/api/internal/products/${clientId}/${shopId}/${productId}/images/${imageIndex}/delete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: imageUrl,
          }),
          credentials: "include",
        }
      );

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
        throw new Error(errorData.message || "Failed to delete image");
      }

      const deleteResult = await deleteResponse.json();
      console.log("✅ [IMAGE DELETE] Image deleted successfully");
      console.log(
        "🔄 [IMAGE DELETE] Backend returned updatedImageUrls:",
        deleteResult.updatedImageUrls
      );

      // Update local state
      setProducts((prevProducts) => {
        const updatedProducts = prevProducts.map((p) => {
          if (p.productId === productId) {
            console.log("🔄 [IMAGE DELETE] Updating product:", {
              productId: p.productId,
              oldImageUrls: p.imageUrls,
              newImageUrls: deleteResult.updatedImageUrls,
              oldCount: p.imageUrls?.length || 0,
              newCount: deleteResult.updatedImageUrls?.length || 0,
            });
            return { ...p, imageUrls: deleteResult.updatedImageUrls };
          }
          return p;
        });
        console.log("🔄 [IMAGE DELETE] State update completed");
        return updatedProducts;
      });

      setError(null);
      console.log("🎉 [IMAGE DELETE] Image deletion completed successfully");

      // Force a small delay to ensure state updates are propagated
      setTimeout(() => {
        console.log("🔄 [IMAGE DELETE] Force refresh completed");
      }, 100);
    } catch (error) {
      console.error("❌ [IMAGE DELETE] Error deleting image:", error);
      setError("Erreur lors de la suppression de l'image: " + error.message);
    } finally {
      setDeletingImageIndex(null);
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
    } else if (fieldName === "skus") {
      // For skus field, get the current display value
      const skusObj = product.skus || {};
      if (Object.keys(skusObj).length === 1 && skusObj.default !== undefined) {
        initialValue = skusObj.default;
      } else {
        initialValue = Object.values(skusObj).filter(Boolean).join(", ");
      }
    } else if (fieldName.startsWith("sku_")) {
      // For individual SKU fields
      const skuKey = fieldName.replace("sku_", "");
      const skusObj = product.skus || {};
      initialValue = skusObj[skuKey] || "";
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

    // Ensure we have a string value
    const stringValue = String(initialValue || "");

    // Set both temp value for immediate UI updates and edit form
    setTempInputValue(stringValue);
    setEditForm({
      [fieldName]: initialValue,
    });

    console.log(
      `🔧 [EDIT] Starting edit for ${fieldName}, initial value:`,
      stringValue
    );
  };

  // Optimized input change handler for better performance
  const handleInputChange = (fieldName, value, inputType = "text") => {
    console.log(`🔧 [INPUT] Field: ${fieldName}, Value: "${value}"`);

    // Handle digit-only fields
    if (fieldName === "prix" || fieldName === "poids") {
      // Allow digits, one decimal point, and backspace
      const digitOnlyValue = value.replace(/[^0-9.]/g, "");
      // Ensure only one decimal point
      const parts = digitOnlyValue.split(".");
      const sanitizedValue =
        parts.length > 2
          ? `${parts[0]}.${parts.slice(1).join("")}`
          : digitOnlyValue;
      setTempInputValue(sanitizedValue);
      console.log(`🔧 [INPUT] Sanitized ${fieldName}: "${sanitizedValue}"`);
      return;
    }

    // For other fields, update immediately
    setTempInputValue(value);
  };

  // Optimized function to commit the temp value to editForm (called less frequently)
  const commitTempValue = (fieldName) => {
    console.log(`🔧 [COMMIT] Committing ${fieldName}: "${tempInputValue}"`);
    setEditForm((prev) => ({
      ...prev,
      [fieldName]: tempInputValue,
    }));
  };

  const handleFieldCancel = () => {
    console.log(`❌ [CANCEL] Cancelling edit for field: ${editingField}`);
    setEditingField(null);
    setEditForm({});
    setTempInputValue("");
  };

  const handleFieldSave = async (product, fieldName) => {
    console.log(`💾 [SAVE] Starting save for ${fieldName}`);
    console.log(`💾 [SAVE] tempInputValue: "${tempInputValue}"`);
    console.log(`💾 [SAVE] editForm[${fieldName}]: "${editForm[fieldName]}"`);
    console.log(`💾 [SAVE] editingField: "${editingField}"`);
    console.log(`💾 [SAVE] saving state: ${saving}`);

    try {
      setSaving(true);

      // Determine the value to save based on field type
      let valueToSave;

      // Check if this is a checkbox field by looking at the EditableField type
      const isCheckboxField = fieldName === "OCC" || fieldName === "occ";

      if (isCheckboxField) {
        // For checkbox fields, always use the editForm value (boolean)
        valueToSave = editForm[fieldName];
        console.log(
          `💾 [SAVE] Checkbox field detected, using editForm value: ${valueToSave}`
        );
      } else {
        // For other fields, use temp value if available, otherwise use editForm value
        valueToSave =
          tempInputValue !== undefined && tempInputValue !== ""
            ? tempInputValue
            : editForm[fieldName];
      }

      console.log(`💾 [SAVE] Final valueToSave: "${valueToSave}"`);

      let updateData;
      if (fieldName === "eans") {
        // For eans field, save to the 'default' key in eans object
        updateData = {
          eans: {
            ...(product.eans || {}),
            default: valueToSave,
          },
        };
      } else if (fieldName === "skus") {
        // For skus field, save to the 'default' key in skus object
        updateData = {
          skus: {
            ...(product.skus || {}),
            default: valueToSave,
          },
        };
      } else if (fieldName.startsWith("sku_")) {
        // For individual SKU fields (when multiple SKUs exist)
        const skuKey = fieldName.replace("sku_", "");
        updateData = {
          skus: {
            ...(product.skus || {}),
            [skuKey]: valueToSave,
          },
        };
      } else {
        updateData = { [fieldName]: valueToSave };
      }

      const response = await fetch(
        `/api/internal/products/${product.clientId}/${product.shopId}/${product.productId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
          credentials: "include",
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
                    : fieldName === "skus" || fieldName.startsWith("sku_")
                      ? { skus: updateData.skus }
                      : { [fieldName]: valueToSave }),
                  updatedAt: new Date().toISOString(),
                }
              : p
          )
        );
        setEditingField(null);
        setEditForm({});
        setTempInputValue("");
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
    getCurrentValue = null, // Custom function to get current value
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

    // Get current value using custom function if provided, otherwise use default logic
    let currentValue;
    if (getCurrentValue && typeof getCurrentValue === "function") {
      // Use custom getCurrentValue function for special fields like SKUs
      try {
        currentValue = getCurrentValue();
      } catch (error) {
        console.error(`Error getting current value for ${fieldName}:`, error);
        currentValue = "";
      }
    } else if (fieldName === "eans") {
      // Special handling for eans field
      const eansObj = product.eans || {};
      const firstEan = Object.values(eansObj).find(Boolean);
      currentValue = firstEan || product.codeEAN || "";
    } else if (fieldName === "skus") {
      // Special handling for skus field to prevent object rendering
      const skusObj = product.skus || {};
      if (Object.keys(skusObj).length === 1 && skusObj.default !== undefined) {
        currentValue = skusObj.default;
      } else {
        currentValue = Object.values(skusObj).filter(Boolean).join(", ") || "";
      }
    } else {
      currentValue =
        getFieldValue(product, fieldName, englishFieldName) ||
        (typeof product[fieldName] === "object"
          ? JSON.stringify(product[fieldName])
          : product[fieldName]);
    }

    if (isEditing) {
      return (
        <div className="flex items-start space-x-2 py-1">
          <strong className="w-20 text-sm flex-shrink-0 mt-1">{label}:</strong>
          <div className="flex-1 min-w-0">
            {type === "select" ? (
              <select
                value={editForm[fieldName] || ""}
                onChange={(e) => {
                  setEditForm((prev) => ({
                    ...prev,
                    [fieldName]: e.target.value,
                  }));
                }}
                className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            ) : type === "textarea" ? (
              <textarea
                value={
                  tempInputValue !== undefined
                    ? tempInputValue
                    : editForm[fieldName] || ""
                }
                onChange={(e) => handleInputChange(fieldName, e.target.value)}
                onBlur={() => commitTempValue(fieldName)}
                className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                rows="3"
                autoFocus
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
                type="text" // Always use text input for better UX
                value={
                  tempInputValue !== undefined
                    ? tempInputValue
                    : editForm[fieldName] || ""
                }
                onChange={(e) => handleInputChange(fieldName, e.target.value)}
                onBlur={() => commitTempValue(fieldName)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitTempValue(fieldName);
                    handleFieldSave(product, fieldName);
                  }
                }}
                className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder={
                  fieldName === "prix"
                    ? "Ex: 29.99"
                    : fieldName === "poids"
                      ? "Ex: 150"
                      : type === "number"
                        ? "Entrez un nombre"
                        : `Entrez ${label.toLowerCase()}`
                }
                autoFocus
              />
            )}
          </div>
          <div className="flex space-x-1 flex-shrink-0 relative z-10 pointer-events-auto">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`💾 [BUTTON] Save mousedown for ${fieldName}`, {
                  product: product.productId,
                  fieldName,
                  disabled: saving,
                  editingField,
                  currentValue: tempInputValue,
                });
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`💾 [BUTTON] Save clicked for ${fieldName}`, {
                  product: product.productId,
                  fieldName,
                  disabled: saving,
                  editingField,
                  currentValue: tempInputValue,
                });
                if (!saving) {
                  handleFieldSave(product, fieldName);
                } else {
                  console.log(`💾 [BUTTON] Save blocked - already saving`);
                }
              }}
              disabled={saving}
              className={`px-3 py-2 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50 transition-colors relative z-20 ${saving ? "cursor-not-allowed" : "cursor-pointer"} min-w-[32px] min-h-[32px] flex items-center justify-center`}
              title="Sauvegarder"
              type="button"
            >
              <FaSave />
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`❌ [BUTTON] Cancel mousedown for ${fieldName}`, {
                  editingField,
                  disabled: saving,
                });
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`❌ [BUTTON] Cancel clicked for ${fieldName}`, {
                  editingField,
                  disabled: saving,
                });
                if (!saving) {
                  handleFieldCancel();
                } else {
                  console.log(`❌ [BUTTON] Cancel blocked - currently saving`);
                }
              }}
              disabled={saving}
              className={`px-3 py-2 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 disabled:opacity-50 transition-colors relative z-20 ${saving ? "cursor-not-allowed" : "cursor-pointer"} min-w-[32px] min-h-[32px] flex items-center justify-center`}
              title="Annuler"
              type="button"
            >
              <FaTimes />
            </button>
          </div>
        </div>
      );
    }

    // Display mode - ensure we never render objects directly
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
    } else if (typeof currentValue === "object" && currentValue !== null) {
      // Safety check: never render objects directly
      if (Array.isArray(currentValue)) {
        displayValue = currentValue.join(", ") || "-";
      } else {
        // For objects, show their values or keys
        const values = Object.values(currentValue).filter(Boolean);
        displayValue = values.length > 0 ? values.join(", ") : "-";
      }
    } else {
      displayValue = currentValue || "-";
    }

    return (
      <div className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50 transition-colors group">
        <div className="text-sm flex-1 min-w-0">
          <strong className="text-gray-700 w-20 inline-block flex-shrink-0">
            {label}:
          </strong>
          <span className="text-gray-600 break-words">{displayValue}</span>
        </div>
        <button
          onClick={() => handleFieldEdit(product, fieldName)}
          className="ml-2 px-2 py-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded text-xs transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
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
                            product.imageUrls.length > 0 &&
                            product.imageUrls[0] ? (
                              <img
                                key={`preview-${product.productId}-${product.imageUrls[0]}`}
                                className="h-10 w-10 rounded-md object-cover"
                                src={product.imageUrls[0]}
                                alt={product.titre || "Product image"}
                                onError={(e) => {
                                  console.error(
                                    "Failed to load product preview image for product:",
                                    product.productId,
                                    "URL:",
                                    product.imageUrls[0],
                                    "Available URLs:",
                                    product.imageUrls
                                  );
                                  // Hide the broken image
                                  e.target.style.display = "none";
                                }}
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
                                {/* SKU Management */}
                                {product.skus &&
                                Object.keys(product.skus).length > 1 ? (
                                  <div className="space-y-2">
                                    <h5 className="text-sm font-medium text-gray-700">
                                      SKUs
                                    </h5>
                                    {Object.entries(product.skus).map(
                                      ([key, value], index) => (
                                        <div
                                          key={key}
                                          className="flex items-center gap-1"
                                        >
                                          <span className="text-xs text-gray-500 flex-shrink-0 min-w-fit">
                                            {key}:
                                          </span>
                                          <div className="flex-1">
                                            <EditableField
                                              product={product}
                                              fieldName={`sku_${key}`}
                                              label=""
                                              type="text"
                                              getCurrentValue={() =>
                                                value || ""
                                              }
                                            />
                                          </div>
                                        </div>
                                      )
                                    )}
                                    <div className="text-xs text-gray-500">
                                      {Object.keys(product.skus).length} SKUs
                                      configurés
                                    </div>
                                  </div>
                                ) : (
                                  <EditableField
                                    product={product}
                                    fieldName="skus"
                                    label="SKU"
                                    type="text"
                                  />
                                )}
                              </div>

                              <div className="space-y-3">
                                <h4 className="font-medium text-gray-900 mb-3">
                                  Variantes (consultation uniquement)
                                </h4>
                                <div className="space-y-2">
                                  <div className="flex">
                                    <strong className="w-20 text-sm">
                                      Tailles:
                                    </strong>
                                    <span className="text-sm text-gray-600">
                                      {Array.isArray(
                                        getFieldValue(
                                          product,
                                          "tailles",
                                          "sizes"
                                        )
                                      ) &&
                                      getFieldValue(product, "tailles", "sizes")
                                        .length > 0
                                        ? getFieldValue(
                                            product,
                                            "tailles",
                                            "sizes"
                                          ).join(", ")
                                        : "Aucune taille définie"}
                                    </span>
                                  </div>
                                  <div className="flex">
                                    <strong className="w-20 text-sm">
                                      Couleurs:
                                    </strong>
                                    <span className="text-sm text-gray-600">
                                      {Array.isArray(
                                        getFieldValue(
                                          product,
                                          "couleurs",
                                          "colors"
                                        )
                                      ) &&
                                      getFieldValue(
                                        product,
                                        "couleurs",
                                        "colors"
                                      ).length > 0
                                        ? getFieldValue(
                                            product,
                                            "couleurs",
                                            "colors"
                                          ).join(", ")
                                        : "Aucune couleur définie"}
                                    </span>
                                  </div>
                                </div>
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
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                      {product.imageUrls
                                        .filter(Boolean)
                                        .map((imageUrl, index) => (
                                          <div
                                            key={`gallery-${product.productId}-${index}-${imageUrl}`}
                                            className={`relative group bg-gray-100 rounded-lg overflow-hidden border border-gray-200 hover:border-gray-300 transition-all duration-200 cursor-move ${
                                              draggedImageIndex === index
                                                ? "opacity-50 scale-95"
                                                : ""
                                            }`}
                                            draggable
                                            onDragStart={(e) =>
                                              handleDragStart(e, index)
                                            }
                                            onDragOver={handleDragOver}
                                            onDrop={(e) =>
                                              handleDrop(e, index, product)
                                            }
                                            onDragEnd={handleDragEnd}
                                          >
                                            <div className="aspect-square">
                                              <img
                                                src={imageUrl}
                                                alt={`${product.titre} - Image ${index + 1}`}
                                                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                                onError={(e) => {
                                                  console.error(
                                                    "Failed to load gallery image for product:",
                                                    product.productId,
                                                    "Index:",
                                                    index,
                                                    "URL:",
                                                    imageUrl,
                                                    "All URLs:",
                                                    product.imageUrls
                                                  );
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

                                            {/* Action buttons overlay */}
                                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center">
                                              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
                                                {/* View button */}
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(
                                                      imageUrl,
                                                      "_blank"
                                                    );
                                                  }}
                                                  className="bg-white text-gray-800 p-2 rounded hover:bg-gray-100 transition-colors"
                                                  title="Voir l'image"
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
                                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                    />
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                    />
                                                  </svg>
                                                </button>

                                                {/* Download button */}
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDownloadImage(
                                                      imageUrl,
                                                      product.titre,
                                                      index,
                                                      product
                                                    );
                                                  }}
                                                  className="bg-white text-gray-800 p-2 rounded hover:bg-gray-100 transition-colors"
                                                  title="Télécharger"
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

                                                {/* Replace button */}
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleReplaceImage(
                                                      product.productId,
                                                      index
                                                    );
                                                  }}
                                                  className="bg-white text-gray-800 p-2 rounded hover:bg-gray-100 transition-colors"
                                                  title="Remplacer"
                                                  disabled={
                                                    replacingImageIndex ===
                                                    `${product.productId}-${index}`
                                                  }
                                                >
                                                  {replacingImageIndex ===
                                                  `${product.productId}-${index}` ? (
                                                    <div className="animate-spin w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                                                  ) : (
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
                                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                                      />
                                                    </svg>
                                                  )}
                                                </button>

                                                {/* Delete button */}
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    showDeleteImageModal(
                                                      product.productId,
                                                      index
                                                    );
                                                  }}
                                                  className="bg-red-600 text-white p-2 rounded hover:bg-red-700 transition-colors"
                                                  title="Supprimer"
                                                  disabled={
                                                    deletingImageIndex ===
                                                    `${product.productId}-${index}`
                                                  }
                                                >
                                                  {deletingImageIndex ===
                                                  `${product.productId}-${index}` ? (
                                                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                                  ) : (
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
                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                      />
                                                    </svg>
                                                  )}
                                                </button>
                                              </div>
                                            </div>

                                            {/* Drag indicator */}
                                            <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                              <div className="bg-black bg-opacity-50 text-white p-1 rounded text-xs">
                                                <svg
                                                  className="w-3 h-3"
                                                  fill="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                                </svg>
                                              </div>
                                            </div>
                                          </div>
                                        ))}

                                      {/* Add Image Button - Only show if less than 5 images */}
                                      {product.imageUrls &&
                                        product.imageUrls.length < 5 && (
                                          <div className="aspect-square flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 cursor-pointer group">
                                            <button
                                              onClick={() =>
                                                handleAddImage(
                                                  product.productId
                                                )
                                              }
                                              disabled={
                                                addingImage ===
                                                product.productId
                                              }
                                              className="flex flex-col items-center justify-center w-full h-full text-gray-400 group-hover:text-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                              title="Ajouter une image"
                                            >
                                              {addingImage ===
                                              product.productId ? (
                                                <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                              ) : (
                                                <>
                                                  <svg
                                                    className="w-8 h-8 mb-2"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                  >
                                                    <path
                                                      strokeLinecap="round"
                                                      strokeLinejoin="round"
                                                      strokeWidth={2}
                                                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                                    />
                                                  </svg>
                                                  <span className="text-xs font-medium">
                                                    Ajouter
                                                  </span>
                                                </>
                                              )}
                                            </button>
                                          </div>
                                        )}
                                    </div>

                                    {/* Image count and limit info */}
                                    <div className="mt-2 text-xs text-gray-500">
                                      {product.imageUrls &&
                                        product.imageUrls.length > 0 && (
                                          <span>
                                            {product.imageUrls.length}/5 images
                                            {product.imageUrls.length >= 5 && (
                                              <span className="text-orange-600 ml-2">
                                                (Limite atteinte)
                                              </span>
                                            )}
                                          </span>
                                        )}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
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

                                    {/* Add first image button */}
                                    <button
                                      onClick={() =>
                                        handleAddImage(product.productId)
                                      }
                                      disabled={
                                        addingImage === product.productId
                                      }
                                      className="mt-3 w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {addingImage === product.productId ? (
                                        <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full mr-2"></div>
                                      ) : (
                                        <svg
                                          className="w-4 h-4 mr-2"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                                          />
                                        </svg>
                                      )}
                                      Ajouter une image
                                    </button>
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

      {/* Delete Image Confirmation Modal */}
      {deleteImageModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <div className="flex flex-col items-center text-center">
              <div className="bg-red-100 p-3 rounded-full">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">
                Supprimer l'image
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Êtes-vous sûr de vouloir supprimer cette image? Cette action est
                irréversible.
              </p>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={handleCancelDeleteImage}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmDeleteImage}
                disabled={
                  deletingImageIndex ===
                  `${deleteImageModal.productId}-${deleteImageModal.imageIndex}`
                }
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingImageIndex ===
                `${deleteImageModal.productId}-${deleteImageModal.imageIndex}` ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Suppression...</span>
                  </div>
                ) : (
                  "Supprimer"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Produits;
