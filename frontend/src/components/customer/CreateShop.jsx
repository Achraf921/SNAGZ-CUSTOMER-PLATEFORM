import React, { useState, useEffect } from "react";
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
  nomClient: "",
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

const CreateShop = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [createdShopId, setCreatedShopId] = useState(null);

  // Image upload state
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
        console.log("==== END CREATE SHOP USER INFO ====");
      }
    } catch (error) {
      console.error("Error parsing userInfo:", error);
      setError(
        "Erreur lors de la récupération des informations utilisateur. Veuillez vous reconnecter."
      );
    }

    // If no sub found, try to get userId as fallback
    if (!sub) {
      const fallbackUserId =
        sessionStorage.getItem("userId") || localStorage.getItem("userId");
      if (fallbackUserId) {
        console.warn("No sub found, using fallback userId:", fallbackUserId);
        setUserId(fallbackUserId);
      } else {
        console.error("No user identifier found in storage");
        setError(
          "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
        );
      }
    }
  }, []);

  const handleImageChange = (imageType, file) => {
    if (file) {
      setImages((prev) => ({
        ...prev,
        [imageType]: file,
      }));

      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviewUrls((prev) => ({
          ...prev,
          [imageType]: e.target.result,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImages = async (shopId) => {
    setUploadingImages(true);
    const uploadPromises = [];

    try {
      // Upload logo if exists
      if (images.logo) {
        const logoFormData = new FormData();
        logoFormData.append("logo", images.logo);

        uploadPromises.push(
          fetch(`/api/customer/shops/${shopId}/upload/logo`, {
            method: "POST",
            body: logoFormData,
            credentials: "include",
          })
        );
      }

      // Upload banners if exist
      if (images.desktopBanner || images.mobileBanner) {
        const bannerFormData = new FormData();
        if (images.desktopBanner)
          bannerFormData.append("desktopBanner", images.desktopBanner);
        if (images.mobileBanner)
          bannerFormData.append("mobileBanner", images.mobileBanner);

        uploadPromises.push(
          fetch(`/api/customer/shops/${shopId}/upload/banner`, {
            method: "POST",
            body: bannerFormData,
            credentials: "include",
          })
        );
      }

      // Upload favicon if exists
      if (images.favicon) {
        const faviconFormData = new FormData();
        faviconFormData.append("favicon", images.favicon);

        uploadPromises.push(
          fetch(`/api/customer/shops/${shopId}/upload/favicon`, {
            method: "POST",
            body: faviconFormData,
            credentials: "include",
          })
        );
      }

      const results = await Promise.all(uploadPromises);

      // Check if all uploads were successful
      for (const result of results) {
        if (!result.ok) {
          const errorData = await result.json();
          throw new Error(
            errorData.message || "Erreur lors de l'upload des images"
          );
        }
      }

      return true;
    } catch (error) {
      console.error("Error uploading images:", error);
      setError("Erreur lors de l'upload des images: " + error.message);
      return false;
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (currentStep === 4) {
      // Step 4: Create the shop first
      if (!userId) {
        setError(
          "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
        );
        return;
      }

      setIsSubmitting(true);
      setError(null);
      console.log("Nouveau Formulaire Créer Boutique Soumis:", formData);
      console.log("UserId (sub) utilisé pour la création:", userId);

      try {
        // Determine API URL based on environment
        const apiUrl =
          process.env.NODE_ENV === "production"
            ? `/api/customer/shops/${userId}`
            : `http://localhost:5000/api/customer/shops/${userId}`;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
          credentials: "include",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              `Erreur lors de la création de la boutique (${response.status})`
          );
        }

        console.log("Boutique créée avec succès:", data);
        setCreatedShopId(data.shopId);
        setCurrentStep(5); // Move to image upload step
      } catch (error) {
        console.error("Erreur soumission formulaire:", error);
        setError(
          error.message ||
            "Une erreur est survenue lors de la création de la boutique"
        );
      } finally {
        setIsSubmitting(false);
      }
    } else if (currentStep === 5) {
      // Step 5: Upload images and complete
      const uploadSuccess = await uploadImages(createdShopId);
      if (uploadSuccess) {
        window.location.href = "/client/boutiques"; // Redirect to boutiques page
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
                onChange={(e) => handleImageChange("logo", e.target.files[0])}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.logo && (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.logo}
                    alt="Logo preview"
                    className="h-20 w-20 object-cover rounded-lg border"
                  />
                </div>
              )}
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
                  handleImageChange("desktopBanner", e.target.files[0])
                }
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.desktopBanner && (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.desktopBanner}
                    alt="Desktop banner preview"
                    className="h-20 w-40 object-cover rounded-lg border"
                  />
                </div>
              )}
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
                  handleImageChange("mobileBanner", e.target.files[0])
                }
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.mobileBanner && (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.mobileBanner}
                    alt="Mobile banner preview"
                    className="h-20 w-32 object-cover rounded-lg border"
                  />
                </div>
              )}
            </div>

            {/* Favicon Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Favicon (32x32px recommandé, format .ico ou .png)
              </label>
              <input
                type="file"
                accept="image/*,.ico"
                onChange={(e) =>
                  handleImageChange("favicon", e.target.files[0])
                }
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sna-primary file:text-white hover:file:bg-sna-primary-dark"
              />
              {imagePreviewUrls.favicon && (
                <div className="mt-2">
                  <img
                    src={imagePreviewUrls.favicon}
                    alt="Favicon preview"
                    className="h-8 w-8 object-cover rounded border"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note :</strong> L'ajout d'images est optionnel. Vous
                pourrez toujours ajouter ou modifier ces images plus tard depuis
                la section "Mes Boutiques".
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
              {currentStep > 1 && currentStep !== 5 && (
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
                type={
                  currentStep === 4 || currentStep === 5 ? "submit" : "button"
                }
                onClick={
                  currentStep === 4 || currentStep === 5
                    ? handleSubmit
                    : nextStep
                }
                disabled={isSubmitting || uploadingImages}
                className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                  isSubmitting || uploadingImages
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                }`}
              >
                {isSubmitting && currentStep === 4 ? (
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
                    Création de la boutique...
                  </>
                ) : uploadingImages && currentStep === 5 ? (
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
                    Upload des images...
                  </>
                ) : currentStep === 4 ? (
                  "Créer la boutique"
                ) : currentStep === 5 ? (
                  "Finaliser et terminer"
                ) : (
                  "Suivant"
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CreateShop;
