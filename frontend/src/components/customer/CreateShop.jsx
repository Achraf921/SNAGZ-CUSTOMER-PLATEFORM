import React, { useState, useEffect, useCallback } from "react";
// import { useNavigate } from "react-router-dom"; // Removed unused import
// import InfosProjet from "../InfosProjet"; // Removed unused import
// import InfosClient from "../InfosClient"; // Removed unused import
// import ParametresFacturation from "../ParametresFacturation"; // Removed unused import
// import AssetsBranding from "../AssetsBranding"; // Removed unused import
// import Products from "../Products"; // Removed unused import
// import ReseauxSociaux from "../ReseauxSociaux"; // Removed unused import
import Page1InfosGeneralesProjet from "../formSteps/Page1_InfosGeneralesProjet";
import Page2PlanningLancement from "../formSteps/Page2_PlanningLancement";
import Page3ServicesShopify from "../formSteps/Page3_ServicesShopify";
import Page4DetailsFacturation from "../formSteps/Page4_DetailsFacturation";
import CorruptedFileModal from "../common/CorruptedFileModal";

const steps = [
  { id: 1, name: "Informations Générales" },
  { id: 2, name: "Planning et Lancement" },
  { id: 3, name: "Services, Modules et Maintenance" },
  { id: 4, name: "Détails Facturation" },
  { id: 5, name: "Images de la Boutique" },
];

const initialFormState = {
  // Page 1: Informations Générales du Projet
  nomProjet: "",
  typeProjet: "",
  commercial: "",
  demarrageProjet: "",
  nomChefProjet: "",
  prenomChefProjet: "",
  estBoutiqueEnLigne: false,
  contactsClient: "",

  // Page 2: Planning et Lancement
  dateMiseEnLigne: "",
  dateCommercialisation: "",
  dateSortieOfficielle: "",
  precommande: false,
  dedicaceEnvisagee: false,

  // Page 3: Services, Modules et Maintenance
  typeAbonnementShopify: "",
  coutsEtDetailsModuleMondialRelay: "",
  coutsEtDetailsModuleDelivengo: "",
  coutsEtDetailsMaintenanceSite: "",

  // Page 4: Détails Facturation et Commission
  snaResponsableDesign: "",
  moduleDelivengo: false,
  moduleMondialRelay: false,
};

// Helper to read file as ArrayBuffer to prevent reference loss
const readFileAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

const CreateShop = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [createdShopId, setCreatedShopId] = useState(null);

  // Image upload state - store stable data instead of File objects
  const [images, setImages] = useState({
    logo: null,
    desktopBanner: null,
    mobileBanner: null,
    favicon: null,
  });
  const [imagePreviewUrls, setImagePreviewUrls] = useState({
    logo: null,
    desktopBanner: null,
    mobileBanner: null,
    favicon: null,
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  // Corrupted file modal state
  const [showCorruptedFileModal, setShowCorruptedFileModal] = useState(false);
  const [corruptedFileName, setCorruptedFileName] = useState("");

  // Safe cleanup function (no longer using blob URLs that interfere with Launch Services)
  const cleanupPreviewUrl = useCallback((url) => {
    // Data URLs don't need cleanup and are safe for macOS
    if (url && url.startsWith("data:")) {
      console.log("ℹ️ [IMAGE CLEANUP] Data URL detected, no cleanup needed");
      return;
    }
    // If any blob URLs somehow remain, clean them safely
    if (url && url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(url);
        console.log("⚠️ [IMAGE CLEANUP] Cleaned up unexpected blob URL");
      } catch (error) {
        console.warn("⚠️ [IMAGE CLEANUP] Failed to revoke blob URL:", error);
      }
    }
  }, []);

  // Cleanup all preview URLs (safe for macOS)
  const cleanupAllPreviewUrls = useCallback(() => {
    Object.values(imagePreviewUrls).forEach(cleanupPreviewUrl);
  }, [imagePreviewUrls, cleanupPreviewUrl]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log("🧹 [COMPONENT CLEANUP] Cleaning up all preview URLs safely");
      cleanupAllPreviewUrls();
    };
  }, [cleanupAllPreviewUrls]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => {
      const newState = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };

      // If 'estBoutiqueEnLigne' is unchecked, reset 'snaResponsableDesign'
      if (name === "estBoutiqueEnLigne" && !checked) {
        newState.snaResponsableDesign = ""; // Or your preferred default like 'non'
      }

      return newState;
    });
  };

  // Get user's sub attribute from storage when component mounts
  useEffect(() => {
    // Security: Removed session data logging

    // Try to get userInfo from session or local storage
    let userInfoStr =
      sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
    let sub = null;

    try {
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        // Extract the sub attribute - this is the primary identifier we want to use
        sub = userInfo.sub;
        setUserId(sub);

        console.log("==== CREATE SHOP USER INFO ====");
        console.log("User sub from storage:", sub);
        console.log("Full userInfo:", userInfo);
        console.log("==== END CREATE SHOP USER INFO ====");
      } else {
        console.warn("⚠️ [USER SESSION] No userInfo found in storage");
      }
    } catch (error) {
      console.error("❌ [USER SESSION] Error parsing userInfo:", error);
      setError(
        "Erreur lors de la récupération des informations utilisateur. Veuillez vous reconnecter."
      );
    }

    // If no sub found, try to get userId as fallback
    if (!sub) {
      const fallbackUserId =
        sessionStorage.getItem("userId") || localStorage.getItem("userId");
      if (fallbackUserId) {
        console.warn(
          "⚠️ [USER SESSION] No sub found, using fallback userId:",
          fallbackUserId
        );
        setUserId(fallbackUserId);
      } else {
        console.error("❌ [USER SESSION] No user identifier found in storage");
        setError(
          "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
        );
      }
    }
  }, []);

  // Validate file before processing
  const validateFile = (file, imageType) => {
    console.log(`🔍 [FILE VALIDATION] Validating ${imageType}:`, {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    // Check file type
    if (!file.type.startsWith("image/")) {
      throw new Error(`Le fichier ${imageType} doit être une image.`);
    }

    // Check file size (10MB limit to match backend)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error(
        `Le fichier ${imageType} est trop volumineux. Taille maximale: 10MB.`
      );
    }

    // Special validation for favicon
    if (imageType === "favicon") {
      const validFaviconTypes = [
        "image/x-icon",
        "image/vnd.microsoft.icon",
        "image/png",
        "image/jpeg",
        "image/gif",
      ];
      if (!validFaviconTypes.includes(file.type)) {
        console.warn(
          `⚠️ [FILE VALIDATION] Favicon type ${file.type} might not be optimal`
        );
      }
    }

    console.log(`✅ [FILE VALIDATION] ${imageType} validation passed`);
    return true;
  };

  const handleImageChange = (imageType, file, inputElement = null) => {
    if (!file) {
      console.log(`🔍 [IMAGE CHANGE] No file selected for ${imageType}`);
      return;
    }

    // Function to clear the file input
    const clearFileInput = () => {
      if (inputElement) {
        inputElement.value = "";
      }
      // Also find and clear the input by looking for it in the DOM
      const fileInputs = document.querySelectorAll(`input[type="file"]`);
      fileInputs.forEach((input) => {
        if (input.files && input.files[0] === file) {
          input.value = "";
        }
      });
    };

    try {
      // Validate file
      validateFile(file, imageType);

      // Additional file object validation
      if (!file.size || file.size === 0) {
        throw new Error(`Le fichier ${imageType} semble être vide.`);
      }

      if (!file.type) {
        throw new Error(
          `Le type du fichier ${imageType} ne peut pas être déterminé.`
        );
      }

      // Cleanup previous preview URL for this image type
      const previousUrl = imagePreviewUrls[imageType];
      if (previousUrl) {
        cleanupPreviewUrl(previousUrl);
      }

      console.log(`🔍 [IMAGE CHANGE] Processing ${imageType}:`, {
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        fileType: file.type,
        lastModified: file.lastModified,
      });

      // Immediately read the file into stable data to prevent reference loss
      console.log(
        `📖 [IMAGE PROCESSING] Reading ${imageType} into memory immediately...`
      );

      const processFile = async () => {
        try {
          // Read the file into a stable ArrayBuffer immediately
          const arrayBuffer = await readFileAsArrayBuffer(file);

          // Create stable file data object
          const fileData = {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            data: arrayBuffer,
          };

          // Store the stable data instead of the File object
          setImages((prev) => ({
            ...prev,
            [imageType]: fileData,
          }));

          // Generate preview from the stable data
          const blob = new Blob([arrayBuffer], { type: file.type });
          const reader = new FileReader();

          reader.onload = (e) => {
            const result = e.target.result;
            if (result && result.startsWith("data:image/")) {
              console.log(
                `✅ [IMAGE PREVIEW] Safe preview created for ${imageType}`
              );
              setImagePreviewUrls((prev) => ({ ...prev, [imageType]: result }));
            } else {
              console.warn(
                `⚠️ [IMAGE PREVIEW] Invalid data URL generated for ${imageType}`
              );
            }
          };

          reader.onerror = (e) => {
            console.error(
              `❌ [IMAGE PREVIEW] FileReader error on Blob for ${imageType}:`,
              e.target.error
            );
          };

          reader.readAsDataURL(blob);

          console.log(
            `✅ [IMAGE PROCESSING] ${imageType} processed successfully`
          );
        } catch (error) {
          console.error(
            `❌ [IMAGE PROCESSING] Failed to process ${imageType}:`,
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

          // IMMEDIATELY clear the file input to prevent it from showing the corrupted file name
          clearFileInput();

          // Clear the problematic file from state
          setImages((prev) => ({
            ...prev,
            [imageType]: null,
          }));
          setImagePreviewUrls((prev) => ({
            ...prev,
            [imageType]: null,
          }));

          // Show modal for corrupted files and don't load them
          if (error?.name === "NotReadableError") {
            setCorruptedFileName(file.name);
            setShowCorruptedFileModal(true);
            // Don't set any error in the main error state - the modal handles it
          } else {
            setError(
              `Erreur lors du traitement du fichier ${imageType}: ${error.message}`
            );
          }
        }
      };

      processFile();
    } catch (error) {
      console.error(
        `❌ [IMAGE CHANGE] Validation failed for ${imageType}:`,
        error.message
      );

      // IMMEDIATELY clear the file input
      clearFileInput();

      setError(error.message);

      // Clear any potentially problematic file
      setImages((prev) => ({
        ...prev,
        [imageType]: null,
      }));
      setImagePreviewUrls((prev) => ({
        ...prev,
        [imageType]: null,
      }));
    }
  };

  const uploadImages = async (shopId) => {
    console.log(`🚀 [IMAGE UPLOAD] Starting upload process for shop ${shopId}`);
    setUploadingImages(true);
    setUploadProgress({});

    const uploadResults = [];

    try {
      // Create AbortController for timeout handling
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn("⏰ [IMAGE UPLOAD] Upload timeout reached, aborting...");
        abortController.abort();
      }, 300000); // 5 minutes timeout to handle large files and slow S3 uploads

      // Use the unified upload approach like internal portal
      const imagesToUpload = [];

      if (images.logo) {
        imagesToUpload.push({ type: "logo", fileData: images.logo });
      }

      if (images.desktopBanner) {
        imagesToUpload.push({
          type: "desktopBanner",
          fileData: images.desktopBanner,
        });
      }

      if (images.mobileBanner) {
        imagesToUpload.push({
          type: "mobileBanner",
          fileData: images.mobileBanner,
        });
      }

      if (images.favicon) {
        imagesToUpload.push({ type: "favicon", fileData: images.favicon });
      }

      if (imagesToUpload.length === 0) {
        console.log("ℹ️ [IMAGE UPLOAD] No images to upload");
        clearTimeout(timeoutId);
        return true;
      }

      console.log(
        `📤 [IMAGE UPLOAD] Uploading ${imagesToUpload.length} image(s)...`
      );

      // Files are already in memory as stable data, no need to read them again
      console.log("✅ [IMAGE UPLOAD] Using pre-loaded file data for uploads.");

      // Upload each image SEQUENTIALLY to prevent multer "Unexpected end of form" errors
      for (const { type, fileData } of imagesToUpload) {
        console.log(`📤 [IMAGE UPLOAD] Preparing ${type} upload...`);

        const formData = new FormData();
        // Use the stable ArrayBuffer data wrapped in a Blob
        const blob = new Blob([fileData.data], { type: fileData.type });
        formData.append("image", blob, fileData.name); // Use "image" field name like internal portal
        formData.append("imageType", type); // Specify image type in body

        console.log(`📤 [${type.toUpperCase()} UPLOAD] FormData prepared:`, {
          imageFieldName: "image",
          imageType: type,
          fileName: fileData.name,
          fileSize: fileData.size,
          fileType: fileData.type,
        });

        // Debug FormData entries
        console.log(`📦 [${type.toUpperCase()} UPLOAD] FormData entries:`);
        for (let [key, value] of formData.entries()) {
          if (value instanceof Blob) {
            console.log(
              `  ${key}: Blob(${fileData.name}, ${value.type}, ${value.size} bytes)`
            );
          } else {
            // Security: Removed potentially sensitive form data logging
          }
        }

        // Upload SEQUENTIALLY to prevent multer errors
        try {
          const uploadStartTime = Date.now();
          console.log(
            `🚀 [${type.toUpperCase()} UPLOAD] Starting upload at ${new Date().toISOString()}...`
          );
          console.log(
            `🚀 [${type.toUpperCase()} UPLOAD] URL: /api/customer/shops/${userId}/${shopId}/upload-image`
          );
          console.log(`🚀 [${type.toUpperCase()} UPLOAD] Method: POST`);
          // Security: Removed credential logging

          const response = await fetch(
            `/api/customer/shops/${userId}/${shopId}/upload-image`,
            {
              method: "POST",
              body: formData,
              credentials: "include",
              signal: abortController.signal,
              // DON'T set Content-Type header - let browser set it for multipart/form-data
            }
          );

          const uploadDuration = Date.now() - uploadStartTime;
          console.log(
            `📤 [${type.toUpperCase()} UPLOAD] Response received after ${uploadDuration}ms`
          );
          console.log(
            `📤 [${type.toUpperCase()} UPLOAD] Response status: ${response.status}`
          );
          console.log(
            `📤 [${type.toUpperCase()} UPLOAD] Response headers:`,
            Object.fromEntries(response.headers.entries())
          );

          if (!response.ok) {
            let errorMessage = `Erreur lors de l'upload ${type}`;
            try {
              const errorData = await response.json();
              errorMessage = errorData.message || errorMessage;
              console.error(
                `❌ [${type.toUpperCase()} UPLOAD] Failed:`,
                errorData
              );
            } catch (parseError) {
              console.error(
                `❌ [${type.toUpperCase()} UPLOAD] Failed with status ${response.status}, could not parse error response`
              );
            }
            throw new Error(errorMessage);
          } else {
            try {
              const successData = await response.json();
              console.log(
                `✅ [${type.toUpperCase()} UPLOAD] Success:`,
                successData
              );
              uploadResults.push({ type, data: successData });
            } catch (parseError) {
              console.warn(
                `⚠️ [${type.toUpperCase()} UPLOAD] Success but could not parse response`
              );
            }
          }
        } catch (uploadError) {
          if (uploadError.name === "AbortError") {
            throw new Error("Upload aborted due to timeout");
          }
          throw uploadError;
        }
      }
      clearTimeout(timeoutId);

      console.log("✅ [IMAGE UPLOAD] All uploads completed successfully");
      return true;
    } catch (error) {
      if (error.name === "AbortError") {
        console.error("❌ [IMAGE UPLOAD] Upload aborted due to timeout");
        setError(
          "L'upload des images a pris trop de temps. Veuillez réessayer avec des fichiers plus petits."
        );
      } else if (error.message.includes("Failed to fetch")) {
        console.error("❌ [IMAGE UPLOAD] Network error:", error);
        setError(
          "Erreur de connexion lors de l'upload des images. Vérifiez votre connexion internet et réessayez."
        );
      } else {
        console.error("❌ [IMAGE UPLOAD] Upload error:", error);
        setError("Erreur lors de l'upload des images: " + error.message);
      }
      return false;
    } finally {
      setUploadingImages(false);
      setUploadProgress({});
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (currentStep === 5) {
      // Step 5: Create the shop and upload images
      console.log("🚀 [SHOP CREATION] Starting shop creation process...");

      if (!userId) {
        console.error("❌ [SHOP CREATION] No userId found");
        setError(
          "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
        );
        return;
      }

      // Validate mandatory date fields
      if (
        !formData.dateMiseEnLigne ||
        !formData.dateCommercialisation ||
        !formData.dateSortieOfficielle
      ) {
        console.error("❌ [SHOP CREATION] Missing mandatory date fields");
        setError(
          "Veuillez remplir tous les champs obligatoires : Date de Mise en Ligne Prévue, Date de Commercialisation, et Date de Sortie Officielle."
        );
        return;
      }

      setIsSubmitting(true);
      setError(null);
      console.log("==== SHOP CREATION SUBMISSION ====");
      console.log("Form data:", formData);
      console.log("UserId (sub) utilisé pour la création:", userId);
      console.log("Images to upload:", {
        hasLogo: !!images.logo,
        hasDesktopBanner: !!images.desktopBanner,
        hasMobileBanner: !!images.mobileBanner,
        hasFavicon: !!images.favicon,
      });
      console.log("==== END SHOP CREATION SUBMISSION ====");

      try {
        // Determine API URL based on environment
        const apiUrl = `/api/customer/shops/${userId}`;
        console.log(`📤 [SHOP CREATION] Making request to: ${apiUrl}`);

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
          credentials: "include",
        });

        console.log(`📤 [SHOP CREATION] Response status: ${response.status}`);
        const data = await response.json();

        if (!response.ok) {
          console.error("❌ [SHOP CREATION] Failed:", data);
          throw new Error(
            data.message ||
              `Erreur lors de la création de la boutique (${response.status})`
          );
        }

        console.log("✅ [SHOP CREATION] Boutique créée avec succès:", data);
        setCreatedShopId(data.shopId);

        // Upload images if any were selected
        const hasImages =
          images.logo ||
          images.desktopBanner ||
          images.mobileBanner ||
          images.favicon;
        if (hasImages) {
          console.log("📤 [SHOP CREATION] Proceeding with image uploads...");
          const uploadSuccess = await uploadImages(data.shopId);
          if (uploadSuccess) {
            console.log(
              "✅ [SHOP CREATION] Complete process successful, redirecting..."
            );
            window.location.href = "/client/boutiques"; // Redirect to boutiques page
          } else {
            console.warn(
              "⚠️ [SHOP CREATION] Shop created but image upload failed"
            );
            setError(
              "La boutique a été créée mais l'upload des images a échoué. Vous pouvez ajouter les images plus tard depuis la page 'Mes Boutiques'."
            );
          }
        } else {
          console.log("ℹ️ [SHOP CREATION] No images to upload, redirecting...");
          window.location.href = "/client/boutiques"; // Redirect to boutiques page
        }
      } catch (error) {
        console.error(
          "❌ [SHOP CREATION] Erreur soumission formulaire:",
          error
        );
        setError(
          error.message ||
            "Une erreur est survenue lors de la création de la boutique"
        );
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const nextStep = (e) => {
    e.preventDefault();
    setCurrentStep((prev) => Math.min(prev + 1, steps.length));
  };

  const prevStep = (e) => {
    e.preventDefault();
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const renderStep = () => {
    const commonProps = { formData, handleChange };
    switch (currentStep) {
      case 1:
        return <Page1InfosGeneralesProjet {...commonProps} />;
      case 2:
        return <Page2PlanningLancement {...commonProps} />;
      case 3:
        return <Page3ServicesShopify {...commonProps} />;
      case 4:
        return <Page4DetailsFacturation {...commonProps} />;
      case 5:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Images de la Boutique
            </h2>
            <p className="text-gray-600 mb-6">
              Ajoutez le logo et les bannières de votre boutique (optionnel).
            </p>

            {/* Logo Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Logo de la boutique
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  console.log(
                    "🔍 [FILE INPUT] Logo file input changed:",
                    e.target.files
                  );
                  handleImageChange("logo", e.target.files?.[0], e.target);
                }}
                key="logo-input" // Stable key
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.logo ? (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.logo}
                    alt="Logo preview"
                    className="h-20 w-20 object-cover rounded-lg border"
                  />
                </div>
              ) : images.logo ? (
                <div className="mt-2 p-4 bg-gray-100 rounded-lg border flex items-center justify-center h-20 w-20">
                  <span className="text-xs text-gray-500 text-center">
                    {images.logo.name}
                    <br />
                    <span className="text-green-600">
                      ✓ Fichier sélectionné
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            {/* Desktop Banner Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Bannière Desktop (1920x400px recommandé)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleImageChange(
                    "desktopBanner",
                    e.target.files[0],
                    e.target
                  )
                }
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.desktopBanner ? (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.desktopBanner}
                    alt="Desktop banner preview"
                    className="h-20 w-40 object-cover rounded-lg border"
                  />
                </div>
              ) : images.desktopBanner ? (
                <div className="mt-2 p-2 bg-gray-100 rounded-lg border flex items-center justify-center h-20 w-40">
                  <span className="text-xs text-gray-500 text-center">
                    {images.desktopBanner.name}
                    <br />
                    <span className="text-green-600">
                      ✓ Fichier sélectionné
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            {/* Mobile Banner Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Bannière Mobile (750x400px recommandé)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleImageChange("mobileBanner", e.target.files[0], e.target)
                }
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.mobileBanner ? (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.mobileBanner}
                    alt="Mobile banner preview"
                    className="h-20 w-32 object-cover rounded-lg border"
                  />
                </div>
              ) : images.mobileBanner ? (
                <div className="mt-2 p-2 bg-gray-100 rounded-lg border flex items-center justify-center h-20 w-32">
                  <span className="text-xs text-gray-500 text-center">
                    {images.mobileBanner.name}
                    <br />
                    <span className="text-green-600">
                      ✓ Fichier sélectionné
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            {/* Favicon Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Favicon (32x32px recommandé, format .ico ou .png)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleImageChange("favicon", e.target.files[0], e.target)
                }
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.favicon ? (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.favicon}
                    alt="Favicon preview"
                    className="h-20 w-20 object-cover rounded-lg border"
                  />
                </div>
              ) : images.favicon ? (
                <div className="mt-2 p-2 bg-gray-100 rounded-lg border flex items-center justify-center h-20 w-20">
                  <span className="text-xs text-gray-500 text-center">
                    {images.favicon.name}
                    <br />
                    <span className="text-green-600">
                      ✓ Fichier sélectionné
                    </span>
                  </span>
                </div>
              ) : null}
            </div>

            {/* Upload Progress Indicator */}
            {uploadingImages && (
              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-amber-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <p className="text-sm text-amber-800 font-medium">
                    Upload des images en cours...
                  </p>
                </div>
                <div className="mt-2 text-xs text-amber-700">
                  {images.logo && <div>• Logo</div>}
                  {(images.desktopBanner || images.mobileBanner) && (
                    <div>• Bannières</div>
                  )}
                  {images.favicon && <div>• Favicon</div>}
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note :</strong> L'ajout d'images est optionnel. Vous
                pourrez toujours ajouter ou modifier ces images plus tard depuis
                la section "Mes Boutiques".
              </p>
            </div>

            {/* File format help */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                <strong>Formats acceptés :</strong> JPG, PNG, GIF, WebP (max
                10MB)
                <br />
                <strong>Conseil :</strong> Si un fichier ne s'affiche pas
                correctement, essayez de le sélectionner à nouveau ou utilisez
                un autre format.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-9xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Créer une nouvelle boutique
      </h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <nav aria-label="Progress" className="border-b border-gray-200">
            <ol className="flex divide-x divide-gray-200">
              {steps.map((step) => (
                <li
                  key={step.id}
                  className={`relative flex flex-1 ${
                    step.id < currentStep
                      ? "bg-sna-primary/10"
                      : step.id === currentStep
                        ? "bg-white"
                        : "bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex items-center px-6 py-4 text-sm font-medium ${
                      step.id === currentStep
                        ? "text-sna-primary"
                        : step.id < currentStep
                          ? "text-sna-success"
                          : "text-gray-500"
                    }`}
                  >
                    <span className="flex-shrink-0">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                          step.id === currentStep
                            ? "border-sna-primary"
                            : step.id < currentStep
                              ? "border-sna-success"
                              : "border-gray-300"
                        }`}
                      >
                        {step.id}
                      </span>
                    </span>
                    <span className="ml-4 text-sm font-medium">
                      {step.name}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          <div className="px-4 py-5 sm:p-6">{renderStep()}</div>

          <div className="px-4 py-3 bg-gray-50 sm:px-6">
            {/* Error message display */}
            {error && (
              <div
                className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
                role="alert"
              >
                <span className="block sm:inline">{error}</span>
              </div>
            )}

            <div className="flex justify-between">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={isSubmitting}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Précédent
                </button>
              )}
              <div className="flex-1" />
              <button
                type={currentStep === 5 ? "submit" : "button"}
                onClick={currentStep === 5 ? handleSubmit : nextStep}
                disabled={isSubmitting || uploadingImages}
                className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                  isSubmitting || uploadingImages
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                }`}
              >
                {isSubmitting && currentStep === 5 ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {uploadingImages
                      ? "Upload des images..."
                      : "Création de la boutique..."}
                  </>
                ) : currentStep === 5 ? (
                  "Créer la boutique"
                ) : (
                  "Suivant"
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Corrupted File Modal */}
      <CorruptedFileModal
        isOpen={showCorruptedFileModal}
        onClose={() => setShowCorruptedFileModal(false)}
        fileName={corruptedFileName}
      />
    </div>
  );
};

export default CreateShop;
