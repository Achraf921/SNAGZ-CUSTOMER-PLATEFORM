import React, { useState, useEffect } from "react";
import {
  FaStore,
  FaShoppingBag,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimes,
} from "react-icons/fa";
import NotificationModal from "../shared/NotificationModal"; // Import the modal
import CorruptedFileModal from "../common/CorruptedFileModal";

const CreateProduct = () => {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [userId, setUserId] = useState(null);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    title: "",
    type: "info",
  });
  const [corruptedFileModal, setCorruptedFileModal] = useState({
    show: false,
    file: null,
  });

  // Product form state
  const [productForm, setProductForm] = useState({
    titre: "",
    description: "",
    prix: "",
    poids: "",
    price: "", // EN field equivalent
    weight: "", // EN field equivalent
    eans: {}, // EAN per combination
    masterEan: "", // Master EAN for all variants
    noEan: false, // "Pas d'EAN" option
    hasColors: false,
    colors: [],
    hasSizes: false,
    sizes: [],
    typeProduit: "Phono", // Set initial value to ensure dropdown renders
    produit: "", // specific product category
    occ: false,
    active: false,
    documented: false,
    hasShopify: false,
    hasEC: false,
    stock: {},
    skus: {},
  });
  const [images, setImages] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

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

  // Mapping from main product type to its specific product options
  const produitOptionsMap = {
    Phono: ["CD", "Vinyl", "DVD", "Blue-Ray", "Autre"],
    Merch: [
      "T-Shirt",
      "Hoodie",
      "Pantalon",
      "Chemise",
      "Coque",
      "Casquette",
      "Mug",
      "Bracelet",
      "Sticker",
      "Lithographie",
      "Livre",
      "Photographie",
      "Autre",
    ],
    POD: [
      "T-Shirt",
      "Hoodie",
      "Pantalon",
      "Chemise",
      "Coque",
      "Casquette",
      "Mug",
      "Bracelet",
      "Sticker",
      "Lithographie",
      "Livre",
      "Photographie",
      "Autre",
    ],
  };

  // Helper to sanitize strings used in SKU
  const sanitizeForSku = (str) => {
    if (!str) return "";
    return str
      .toString()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9]/g, "");
  };

  // Generate SKU for a given size/color combination based on business rules
  const generateSkuForCombination = (combo) => {
    const { typeProduit, produit, titre, occ } = productForm;

    const albumPart = sanitizeForSku(titre);
    const colorPart = combo.color ? sanitizeForSku(combo.color) : null;
    const sizePart = combo.size ? sanitizeForSku(combo.size) : null;

    let sku = "";

    if (typeProduit === "Phono") {
      // TYPEDEPRODUIT-NOMALBUM-NOM-ARTISTE-STDOUDEDICACE
      const typeSegment = sanitizeForSku(produit || typeProduit);
      const artistSegment = sanitizeForSku(
        selectedShop?.artist ||
          selectedShop?.name ||
          selectedShop?.nomProjet ||
          "ARTIST"
      );
      const occPart = occ ? "OCC" : null;
      sku = [typeSegment, albumPart, artistSegment, occPart]
        .filter(Boolean)
        .join("-");
    } else if (typeProduit === "Merch") {
      // TYPEDEPRODUIT-NOMALBUM-COULEUROUMODELE-TAILLE
      const typeSegment = sanitizeForSku(produit);
      const parts = [typeSegment, albumPart];
      if (colorPart) parts.push(colorPart);
      if (sizePart) parts.push(sizePart);
      sku = parts.filter(Boolean).join("-");
    } else if (typeProduit === "POD") {
      // POD-x 38 chars max
      const produitSegment = sanitizeForSku(produit);
      const parts = ["POD", produitSegment, albumPart];
      if (colorPart) parts.push(colorPart);
      if (sizePart) parts.push(sizePart);
      sku = parts.filter(Boolean).join("-");
      if (sku.length > 38) sku = sku.substring(0, 38);
    }

    return sku;
  };

  // Update SKUs whenever relevant dependencies change
  useEffect(() => {
    const combinations = generateStockCombinations();
    const newSkus = {};
    combinations.forEach((combo) => {
      newSkus[combo.key] = generateSkuForCombination(combo);
    });

    setProductForm((prev) => ({
      ...prev,
      skus: newSkus,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    productForm.sizes,
    productForm.colors,
    productForm.hasSizes,
    productForm.hasColors,
    productForm.typeProduit,
    productForm.produit,
    productForm.titre,
    productForm.occ,
  ]);

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
        // Filter only shops that are valid (removed hasShopify requirement)
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

  // Preselect shop from URL query param
  useEffect(() => {
    if (shops.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const preShopId = params.get("shopId");
    if (preShopId && !selectedShop) {
      const match = shops.find((s) => s.shopId === preShopId);
      if (match) setSelectedShop(match);
    }
  }, [shops, selectedShop]);

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
    // Reset dependant fields when changing main product type
    if (field === "typeProduit") {
      setProductForm((prev) => ({
        ...prev,
        typeProduit: value,
        produit: "", // reset sub-type when main type changes
        // For Phono products, automatically disable sizes
        hasSizes: value === "Phono" ? false : prev.hasSizes,
        sizes: value === "Phono" ? [] : prev.sizes,
      }));
    } else {
      setProductForm((prev) => ({ ...prev, [field]: value }));
    }
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

  // Handle master EAN changes
  const handleMasterEanChange = (value) => {
    // Keep only digits and limit to 13 characters
    const sanitized = value.replace(/\D/g, "").slice(0, 13);

    setProductForm((prev) => {
      // Clear no EAN flag if user is entering EAN
      const newNoEan = sanitized === "" ? prev.noEan : false;

      // Update all variant EANs with the master EAN
      const combinations = generateStockCombinations();
      const newEans = { ...prev.eans };

      // Set master EAN for all combinations and default
      newEans.default = sanitized;
      combinations.forEach((combo) => {
        newEans[combo.key] = sanitized;
      });

      return {
        ...prev,
        masterEan: sanitized,
        noEan: newNoEan,
        eans: newEans,
      };
    });
  };

  // Handle "pas d'EAN" toggle
  const handleNoEanToggle = (checked) => {
    setProductForm((prev) => {
      const combinations = generateStockCombinations();
      const newEans = { ...prev.eans };

      if (checked) {
        // Set all EANs to the default "no EAN" value
        newEans.default = "0000000000000";
        combinations.forEach((combo) => {
          newEans[combo.key] = "0000000000000";
        });
      } else {
        // Clear all EANs
        newEans.default = "";
        combinations.forEach((combo) => {
          newEans[combo.key] = "";
        });
      }

      return {
        ...prev,
        noEan: checked,
        masterEan: checked ? "0000000000000" : "",
        eans: newEans,
      };
    });
  };

  // Clean up stock & eans when sizes/colors change
  const cleanupStock = () => {
    const validCombinations = generateStockCombinations();
    const validKeys = validCombinations.map((combo) => combo.key);

    setProductForm((prev) => {
      const cleanedStock = {};
      const cleanedEans = {};

      // Always preserve the default EAN
      if (prev.eans.default !== undefined) {
        cleanedEans.default = prev.eans.default;
      }

      validKeys.forEach((key) => {
        if (prev.stock[key] !== undefined) {
          cleanedStock[key] = prev.stock[key];
        }
        if (prev.eans[key] !== undefined) {
          cleanedEans[key] = prev.eans[key];
        } else if (prev.masterEan) {
          // If master EAN is set, apply it to new variants
          cleanedEans[key] = prev.masterEan;
        }
      });

      return {
        ...prev,
        stock: cleanedStock,
        eans: cleanedEans,
      };
    });
  };

  // Helper to read file as ArrayBuffer to prevent reference loss and detect corruption
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleImageChange = async (files, inputElement) => {
    const newFiles = Array.from(files);

    // Check number of files limit
    if (images.length + newFiles.length > 5) {
      setNotification({
        show: true,
        message: "Vous ne pouvez télécharger que 5 images au maximum.",
        title: "Limite d'images atteinte",
        type: "warning",
      });
      // Clear the file input to allow reselection
      if (inputElement) inputElement.value = "";
      return;
    }

    // Check file size limit (50MB per file)
    const maxFileSize = 50 * 1024 * 1024; // 50MB in bytes
    const oversizedFiles = newFiles.filter((file) => file.size > maxFileSize);

    if (oversizedFiles.length > 0) {
      const oversizedFileNames = oversizedFiles
        .map((file) => file.name)
        .join(", ");
      const fileSizeInMB = (oversizedFiles[0].size / (1024 * 1024)).toFixed(1);

      setNotification({
        show: true,
        message: `Les fichiers suivants sont trop volumineux: ${oversizedFileNames}. Taille maximum autorisée: 50MB. Taille du fichier: ${fileSizeInMB}MB`,
        title: "Fichiers trop volumineux",
        type: "error",
      });
      // Clear the file input to allow reselection
      if (inputElement) inputElement.value = "";
      return;
    }

    // Check if files are actually images
    const nonImageFiles = newFiles.filter(
      (file) => !file.type.startsWith("image/")
    );

    if (nonImageFiles.length > 0) {
      const nonImageFileNames = nonImageFiles
        .map((file) => file.name)
        .join(", ");

      setNotification({
        show: true,
        message: `Les fichiers suivants ne sont pas des images valides: ${nonImageFileNames}. Seuls les fichiers image sont autorisés.`,
        title: "Format de fichier invalide",
        type: "error",
      });
      // Clear the file input to allow reselection
      if (inputElement) inputElement.value = "";
      return;
    }

    // Validate files for corruption by attempting to read them
    console.log(
      `📖 [IMAGE PROCESSING] Validating ${newFiles.length} files for corruption...`
    );

    const validFiles = [];
    for (const file of newFiles) {
      try {
        // Attempt to read the file into memory to detect corruption
        await readFileAsArrayBuffer(file);
        validFiles.push(file);
        console.log(
          `✅ [IMAGE PROCESSING] File validated successfully: ${file.name}`
        );
      } catch (error) {
        console.error(
          `❌ [IMAGE PROCESSING] Failed to process file: ${file.name}`,
          {
            error: error,
            errorName: error?.name,
            errorMessage: error?.message,
            fileInfo: {
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified,
            },
          }
        );

        // Show modal for corrupted files and don't load them
        if (error?.name === "NotReadableError") {
          setCorruptedFileModal({
            show: true,
            file: file.name,
          });
          console.warn(
            `⚠️ [IMAGE PROCESSING] Corrupted file blocked: ${file.name}`
          );

          // Clear the file input to prevent corrupted files from being loaded
          if (inputElement) inputElement.value = "";
          return; // Stop processing if any file is corrupted
        } else {
          console.error(
            `❌ [IMAGE PROCESSING] Unexpected error processing file: ${file.name}`,
            error.message
          );
          // For non-corruption errors, show a generic notification
          setNotification({
            show: true,
            message: `Erreur lors du traitement du fichier: ${file.name}. Veuillez réessayer.`,
            title: "Erreur de fichier",
            type: "error",
          });
          if (inputElement) inputElement.value = "";
          return;
        }
      }
    }

    // Only proceed if all files are valid and not corrupted
    if (validFiles.length === newFiles.length) {
      const updatedImages = [...images, ...validFiles];
      setImages(updatedImages);

      // Create and update preview URLs
      const newPreviewUrls = [];
      validFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          newPreviewUrls.push(e.target.result);
          // When all new files are read, update the state
          if (newPreviewUrls.length === validFiles.length) {
            setImagePreviewUrls((prevUrls) => [...prevUrls, ...newPreviewUrls]);
          }
        };
        reader.readAsDataURL(file);
      });

      console.log(
        `✅ [IMAGE PROCESSING] Successfully processed ${validFiles.length} valid files`
      );
    }
  };

  const removeImage = (indexToRemove) => {
    setImages((prevImages) =>
      prevImages.filter((_, index) => index !== indexToRemove)
    );
    setImagePreviewUrls((prevUrls) =>
      prevUrls.filter((_, index) => index !== indexToRemove)
    );
  };

  // Drag and drop functionality for reordering images
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    // Reorder images and preview URLs
    const newImages = [...images];
    const newPreviewUrls = [...imagePreviewUrls];

    const draggedImage = newImages[draggedIndex];
    const draggedPreviewUrl = newPreviewUrls[draggedIndex];

    // Remove dragged items
    newImages.splice(draggedIndex, 1);
    newPreviewUrls.splice(draggedIndex, 1);

    // Insert at new position
    newImages.splice(dropIndex, 0, draggedImage);
    newPreviewUrls.splice(dropIndex, 0, draggedPreviewUrl);

    setImages(newImages);
    setImagePreviewUrls(newPreviewUrls);
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const uploadProductImages = async (shopId, productId) => {
    if (images.length === 0) return true;

    setUploadingImages(true);

    // Validate file sizes before upload (50MB limit)
    const maxFileSize = 50 * 1024 * 1024; // 50MB in bytes
    const oversizedFiles = [];

    images.forEach((image, index) => {
      if (image.size > maxFileSize) {
        oversizedFiles.push({
          name: image.name,
          size: (image.size / (1024 * 1024)).toFixed(2) + "MB",
        });
      }
    });

    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles
        .map((f) => `${f.name} (${f.size})`)
        .join(", ");
      setError(
        `Les images suivantes dépassent la limite de 50MB: ${fileList}. Veuillez les compresser ou choisir des images plus petites.`
      );
      setUploadingImages(false);
      return false;
    }

    const formData = new FormData();

    console.log("🔍 [FRONTEND UPLOAD DEBUG] Starting image upload");
    console.log("🔍 [FRONTEND UPLOAD DEBUG] Shop ID:", shopId);
    console.log("🔍 [FRONTEND UPLOAD DEBUG] Product ID:", productId);
    console.log("🔍 [FRONTEND UPLOAD DEBUG] Number of images:", images.length);

    images.forEach((image, index) => {
      console.log(
        `🔍 [FRONTEND UPLOAD DEBUG] Adding image ${index + 1}:`,
        image.name,
        image.type,
        image.size
      );
      formData.append("productImages", image, image.name);
    });

    // Debug FormData contents
    console.log("🔍 [FRONTEND UPLOAD DEBUG] FormData entries:");
    for (let [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(
          `  ${key}: File(${value.name}, ${value.type}, ${value.size} bytes)`
        );
      } else {
        // Security: Removed potentially sensitive form data logging
      }
    }

    try {
      console.log(
        "🔍 [FRONTEND UPLOAD DEBUG] Sending request to:",
        `/api/customer/shops/${userId}/${shopId}/products/${productId}/upload-images`
      );
      const response = await fetch(
        `/api/customer/shops/${userId}/${shopId}/products/${productId}/upload-images`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      console.log(
        "🔍 [FRONTEND UPLOAD DEBUG] Response status:",
        response.status
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("🔍 [FRONTEND UPLOAD DEBUG] Error response:", errorData);
        throw new Error(
          errorData.message || "Erreur lors de l'upload des images"
        );
      }

      const responseData = await response.json();
      console.log("🔍 [FRONTEND UPLOAD DEBUG] Success response:", responseData);

      return true;
    } catch (error) {
      console.error("Error uploading product images:", error);
      setError("Erreur lors de l'upload des images: " + error.message);
      return false;
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedShop) return;

    const combinations = generateStockCombinations();

    // Validation
    const baseInvalid =
      !productForm.titre ||
      !productForm.price ||
      !productForm.typeProduit ||
      !productForm.produit ||
      !productForm.description;

    // Validate EAN: optional but if provided must have exactly 13 digits or be the "no EAN" value
    let invalidEAN = false;

    // Check master EAN if provided
    if (
      productForm.masterEan &&
      productForm.masterEan !== "0000000000000" &&
      !/^\d{13}$/.test(productForm.masterEan)
    ) {
      invalidEAN = true;
    }

    // Validate SKUs: ensure no SKU is empty
    let invalidSKU = false;
    combinations.forEach((combo) => {
      const skuVal = productForm.skus[combo.key];
      if (!skuVal || skuVal.trim() === "") {
        invalidSKU = true;
      }
    });

    // Validate Stock: each combination must have a defined stock (>=0 and not empty)
    // Exception: POD products don't require stock
    let invalidStock = false;
    if (productForm.typeProduit !== "POD") {
      combinations.forEach((combo) => {
        const stVal = productForm.stock[combo.key];
        if (stVal === undefined || stVal === "" || isNaN(stVal)) {
          invalidStock = true;
        }
      });
    }

    if (baseInvalid) {
      setError(
        "Veuillez remplir tous les champs obligatoires (Titre, Description, Prix, Type de produit, Produit)"
      );
      return;
    }

    if (invalidEAN) {
      setError(
        "Si fourni, l'EAN doit être composé de 13 chiffres sans espaces ni virgules."
      );
      return;
    }

    if (invalidSKU) {
      setError(
        "Un SKU est manquant ou invalide. Assurez-vous que les champs 'Type de produit' et 'Produit' sont bien remplis."
      );
      return;
    }

    if (invalidStock) {
      setError(
        "Veuillez renseigner le stock pour chaque variante (non requis pour les produits POD)"
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
        eans: productForm.eans,
        typeProduit: productForm.typeProduit,
        produit: productForm.produit,
        OCC: productForm.occ,
        tailles:
          productForm.typeProduit === "Phono"
            ? []
            : productForm.hasSizes
              ? productForm.sizes
              : [],
        couleurs: productForm.hasColors ? productForm.colors : [],
        stock: productForm.stock,
        shopId: selectedShop.shopId,
        skus: productForm.skus,
      };

      // 🔍 DEBUG: Log the complete product data being sent
      console.log("🔍 [DEBUG] CreateProduct - Form Data:", productForm);
      console.log(
        "🔍 [DEBUG] CreateProduct - Product Data to Send:",
        productData
      );
      console.log("🔍 [DEBUG] CreateProduct - Selected Shop:", selectedShop);
      console.log("🔍 [DEBUG] CreateProduct - User ID:", userId);

      const apiUrl = `/api/customer/shops/${userId}/${selectedShop.shopId}/products`;
      console.log("🔍 [DEBUG] CreateProduct - API URL:", apiUrl);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productData),
        credentials: "include",
      });

      console.log(
        "🔍 [DEBUG] CreateProduct - Response Status:",
        response.status
      );
      console.log("🔍 [DEBUG] CreateProduct - Response OK:", response.ok);

      if (!response.ok) {
        const errorData = await response.json();
        console.log("🔍 [DEBUG] CreateProduct - Error Response:", errorData);
        throw new Error(
          errorData.message || "Erreur lors de la création du produit"
        );
      }

      const responseData = await response.json();
      console.log("🔍 [DEBUG] CreateProduct - Success Response:", responseData);
      console.log(
        "🔍 [DEBUG] CreateProduct - Created Product:",
        responseData.product
      );

      // Upload images if any were selected
      if (images.length > 0 && responseData.product?.productId) {
        const uploadSuccess = await uploadProductImages(
          selectedShop.shopId,
          responseData.product.productId
        );
        if (!uploadSuccess) {
          // If image upload fails, show warning but don't fail the whole operation
          setError(
            "Produit créé avec succès, mais l'upload des images a échoué. Vous pouvez les ajouter plus tard."
          );
        }
      }

      setSubmitSuccess(true);
      // Reset form
      setProductForm({
        titre: "",
        description: "",
        prix: "",
        poids: "",
        price: "",
        weight: "",
        eans: {},
        masterEan: "",
        noEan: false,
        hasColors: false,
        colors: [],
        hasSizes: false,
        sizes: [],
        typeProduit: "Phono",
        produit: "",
        occ: false,
        active: false,
        documented: false,
        hasShopify: false,
        hasEC: false,
        stock: {},
        skus: {},
      });
      setImages([]);
      setImagePreviewUrls([]);

      // Show success notification
      setNotification({
        show: true,
        message: "Le produit a été créé avec succès.",
        title: "Succès",
        type: "success",
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
          Seules les boutiques valides peuvent avoir des produits. Sélectionnez
          d'abord une boutique éligible.
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
                <strong>validée</strong>.
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
                  <option value="Phono">Phono</option>
                  <option value="Merch">Merch</option>
                  <option value="POD">POD (Print on Demand)</option>
                </select>
              </div>

              {/* Produit (sub-type) dropdown */}
              {productForm.typeProduit && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Produit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={productForm.produit}
                    onChange={(e) =>
                      handleInputChange("produit", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                    required
                  >
                    <option value="">Sélectionner un produit</option>
                    {produitOptionsMap[productForm.typeProduit].map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={productForm.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                rows="4"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                required
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
            </div>

            {/* Master EAN Section */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Code EAN (Code-barres)
              </h4>

              <div className="space-y-4">
                {/* Pas d'EAN option */}
                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={productForm.noEan}
                      onChange={(e) => handleNoEanToggle(e.target.checked)}
                      className="form-checkbox h-4 w-4 text-sna-primary"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">
                      Pas d'EAN
                    </span>
                  </label>
                </div>

                {/* Master EAN input */}
                {!productForm.noEan && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Code EAN (appliqué à toutes les variantes)
                    </label>
                    <input
                      type="text"
                      value={productForm.masterEan}
                      onChange={(e) => handleMasterEanChange(e.target.value)}
                      className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
                      pattern="^\d{13}$"
                      inputMode="numeric"
                      placeholder="1234567890123"
                      title="L'EAN doit contenir exactement 13 chiffres"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      13 chiffres exactement. Ce code sera utilisé pour toutes
                      les variantes du produit.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Sizes Section - Hidden for Phono products */}
            {productForm.typeProduit !== "Phono" && (
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
            )}

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
                {productForm.typeProduit !== "POD" && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </h4>
              
              {productForm.typeProduit === "POD" && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-blue-800">
                        <strong>Produit Print on Demand (POD)</strong> - Le stock n'est pas nécessaire car les produits sont fabriqués à la demande. 
                        Les champs de stock sont désactivés pour ce type de produit.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-700">
                                {combo.label}
                                {productForm.typeProduit !== "POD" && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 break-all">
                                {productForm.skus[combo.key] ||
                                  generateSkuForCombination(combo)}
                              </p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={productForm.stock[combo.key] || ""}
                              onChange={(e) =>
                                handleStockChange(combo.key, e.target.value)
                              }
                              className={`w-20 px-2 py-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary text-sm ${
                                productForm.typeProduit !== "POD"
                                  ? "border-gray-300"
                                  : "border-gray-200 bg-gray-50"
                              }`}
                              placeholder="0"
                              disabled={productForm.typeProduit === "POD"}
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
                            <div>
                              <p className="text-sm font-medium text-gray-700">
                                {combo.label}
                                {productForm.typeProduit !== "POD" && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 break-all">
                                {productForm.skus[combo.key] ||
                                  generateSkuForCombination(combo)}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <input
                                type="number"
                                min="0"
                                value={productForm.stock[combo.key] || ""}
                                onChange={(e) =>
                                  handleStockChange(combo.key, e.target.value)
                                }
                                className={`w-24 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary ${
                                  productForm.typeProduit !== "POD"
                                    ? "border-gray-300"
                                    : "border-gray-200 bg-gray-50"
                                }`}
                                placeholder="0"
                                disabled={productForm.typeProduit === "POD"}
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

            {/* Product Images Upload */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Images du produit (optionnel)
              </h4>
              <p className="text-gray-600 text-sm mb-2">
                Vous pouvez ajouter jusqu'à 5 images pour ce produit.
              </p>
              <p className="text-blue-600 text-sm font-medium mb-4">
                📝 Les images seront ajoutées à Shopify dans l'ordre affiché
                ci-dessous. Vous pouvez réorganiser les images en les faisant
                glisser.
              </p>

              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleImageChange(e.target.files, e.target)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />

              <p className="text-sm text-gray-500 mt-2">
                📝 <strong>Formats acceptés:</strong> JPG, PNG, GIF, WebP |
                <strong> Taille max:</strong> 10MB par image |
                <strong> Limite:</strong> 5 images maximum
              </p>

              {imagePreviewUrls.length > 0 && (
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                  {imagePreviewUrls.map((url, index) => (
                    <div
                      key={index}
                      className={`relative group cursor-move ${draggedIndex === index ? "opacity-50" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                    >
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="h-24 w-24 object-cover rounded-lg border"
                      />
                      <div className="absolute top-1 left-1 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <FaTimes />
                      </button>
                      <div className="absolute bottom-1 left-1 right-1 bg-black bg-opacity-70 text-white text-xs text-center rounded">
                        Glisser pour réorganiser
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {uploadingImages && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                    <span className="text-sm text-blue-700">
                      Upload des images en cours...
                    </span>
                  </div>
                </div>
              )}
            </div>

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
      <NotificationModal
        open={notification.show}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={() =>
          setNotification({ show: false, message: "", title: "", type: "info" })
        }
      />
      <CorruptedFileModal
        isOpen={corruptedFileModal.show}
        fileName={corruptedFileModal.file}
        onClose={() => setCorruptedFileModal({ show: false, file: null })}
      />
    </div>
  );
};

export default CreateProduct;
