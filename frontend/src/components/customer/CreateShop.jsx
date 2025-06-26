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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (currentStep !== steps.length) {
      return;
    }

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
      setIsSubmitting(false); // Clear loading state before redirect
      window.location.href = "/client/boutiques"; // Redirect to boutiques page
    } catch (error) {
      console.error("Erreur soumission formulaire:", error);
      setError(
        error.message ||
          "Une erreur est survenue lors de la création de la boutique"
      );
    } finally {
      setIsSubmitting(false);
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
                type={currentStep === steps.length ? "submit" : "button"}
                onClick={currentStep === steps.length ? handleSubmit : nextStep}
                disabled={isSubmitting}
                className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                  isSubmitting
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                }`}
              >
                {isSubmitting && currentStep === steps.length ? (
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
                    Création en cours...
                  </>
                ) : currentStep === steps.length ? (
                  "Soumettre la demande"
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
