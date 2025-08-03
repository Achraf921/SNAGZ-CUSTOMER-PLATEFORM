import React, { useState, useEffect, useMemo } from "react";
import {
  FaTimes,
  FaArrowRight,
  FaCheckCircle,
  FaExclamationTriangle,
  FaCopy,
  FaSpinner,
  FaExclamationCircle,
} from "react-icons/fa";

const ShopifyCreationWizardModal = ({ isOpen, onClose, shop, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [shopifyOpened, setShopifyOpened] = useState(false);

  // Shopify Partner credentials (fetched)
  const [partnerCredentials, setPartnerCredentials] = useState(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState(true);
  const [partnerError, setPartnerError] = useState(null);

  const [showPassword, setShowPassword] = useState(false);

  // New state for shop configuration
  const [adminUrl, setAdminUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isFullyCompleted, setIsFullyCompleted] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);

  const email = partnerCredentials?.email || "";
  const partnerPassword = partnerCredentials?.password || "";

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Reset wizard state when the modal is closed
      setCurrentStep(1);
      setCompletedSteps(new Set());
      setIsFullyCompleted(false);
      setShopifyOpened(false);

      // Reset form fields & feedback
      setAdminUrl("");
      setSaveError(null);
      setSaveSuccess(false);

      // Reset loading / error states
      setIsSaving(false);
      setPartnerCredentials(null);
      setIsLoadingPartner(false);
      setPartnerError(null);

      setIsFinalizing(false);
      setFinalizeError(null);
    }
  }, [isOpen]);

  // Fetch Partner credentials
  useEffect(() => {
    if (isOpen) {
      const fetchPartnerCredentials = async () => {
        try {
          setIsLoadingPartner(true);
          setPartnerError(null);
          const response = await fetch(
            "/api/internal/config/shopify-partner-credentials"
          );
          const isJson = response.headers
            .get("content-type")
            ?.includes("application/json");
          let data = null;
          if (isJson) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          if (!response.ok) {
            const message =
              isJson && data && data.message ? data.message : data;
            throw new Error(message || "Failed to fetch partner credentials");
          }
          if (isJson && data?.credentials) {
            setPartnerCredentials(data.credentials);
          } else {
            throw new Error("Invalid credentials format");
          }
        } catch (err) {
          setPartnerError(err.message);
        } finally {
          setIsLoadingPartner(false);
        }
      };

      fetchPartnerCredentials();
    }
  }, [isOpen]);

  const handleNextStep = () => {
    markStepCompleted(currentStep);
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // This is the final step
      setIsFullyCompleted(true);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const openShopifyPages = () => {
    window.open("https://accounts.shopify.com/store-login", "_blank");
    setShopifyOpened(true);
  };

  const handleSaveAdminUrl = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (!adminUrl.trim()) {
        throw new Error("L'URL d'administration est requise.");
      }

      // Extract domain from admin URL
      const match =
        adminUrl.match(/^https:\/\/(.*?)\.myshopify\.com/) ||
        adminUrl.match(
          /^https:\/\/admin\.shopify\.com\/store\/(.*?)(?:\?|\/|$)/
        );
      if (!match) {
        throw new Error(
          "Format d'URL invalide. Utilisez un format comme https://votre-boutique.myshopify.com/admin"
        );
      }

      const domain = match[1];

      const response = await fetch(
        `/api/internal/shops/${shop._id}/save-domain`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shopifyDomain: domain,
            adminUrl: adminUrl.trim(),
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to save domain.");
      }

      setSaveSuccess(true);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizeShop = async () => {
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      const response = await fetch(
        `/api/internal/shops/${encodeURIComponent(shop._id)}/mark-shopify-created`,
        {
          method: "PUT",
        }
      );
      const isJson = response.headers
        .get("content-type")
        ?.includes("application/json");
      const data = isJson ? await response.json() : await response.text();
      if (!response.ok) {
        const errMsg = isJson ? data.message : data;
        throw new Error(errMsg || "Échec de la finalisation.");
      }
      // Mark last step completed & show congrats panel
      markStepCompleted(steps.length);
      setIsFullyCompleted(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      setFinalizeError(error.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  // ---------------------------
  // Steps construction
  // ---------------------------
  const steps = useMemo(() => {
    const list = [
      {
        id: 1,
        title: "Connexion",
        description: "Connexion à votre compte Shopify",
        instructions: [
          {
            title: "Première connexion",
            steps: [
              "Saisissez l'adresse e-mail ci-dessous puis cliquez sur 'Continuer avec un e-mail'",
              "Saisissez le mot de passe ci-dessous puis cliquez sur 'Se connecter'",
              "Si un code 2FA est demandé, ouvrez votre application d'authentification ou vos SMS, saisissez le code et cliquez sur 'Connexion'",
              "Vous accéderez alors au tableau de bord administrateur",
            ],
          },
          {
            title: "Connexion avec compte existant",
            steps: [
              "Si la page 'Choisir un compte' s'affiche, sélectionnez le compte '<span class=\"font-bold\">Boris Ducteil</span>'",
              "OU vous serez directement redirigé vers le tableau de bord administrateur",
            ],
          },
        ],
      },
      {
        id: 2,
        title: "Accès à la création de boutique",
        description: "Navigation vers l'interface de création",
        instructions: [
          "Une fois sur le tableau de bord Shopify, cliquez sur l'icône en forme de boutique dans le coin supérieur droit avec le nom de la boutique actuelle",
          "Dans le menu déroulant qui apparaît, sélectionnez '<span class=\"font-bold\">Toutes les boutiques</span>'",
          "Un nouvel onglet s'ouvrira avec la liste de toutes vos boutiques",
        ],
      },
      {
        id: 3,
        title: "Création de la nouvelle boutique",
        description: "Étapes de création de la boutique",
        instructions: [
          "Dans le nouvel onglet, cliquez sur le bouton noir '<span class=\"font-bold\">+ Créer une boutique</span>'",
          {
            title: "Configuration de la boutique - Étape 1",
            steps: [
              "Question : '<span class=\"font-bold\">Sur quels canaux souhaitez‑vous vendre ?</span>'",
              "Réponse : Sélectionnez '<span class=\"font-bold\">Une boutique en ligne</span>'",
              "Cliquez sur '<span class=\"font-bold\">Suivant</span>'",
            ],
          },
          {
            title: "Configuration de la boutique - Étape 2",
            steps: [
              "Question : '<span class=\"font-bold\">Cette boutique est-elle destinée à une nouvelle entreprise ou à une entreprise existante ?</span>'",
              "Réponse : Sélectionnez '<span class=\"font-bold\">Entreprise existante</span>'",
              "Cliquez sur '<span class=\"font-bold\">Suivant</span>'",
            ],
          },
          {
            title: "Configuration de la boutique - Étape 3",
            steps: [
              "Question : '<span class=\"font-bold\">Quelle est la taille de votre entreprise ?</span>'",
              "Réponse : Sélectionnez '<span class=\"font-bold\">Petite</span>'",
              "Cliquez sur '<span class=\"font-bold\">Suivant</span>'",
            ],
          },
          {
            title: "Configuration de la boutique - Étape 4",
            steps: [
              "Question : '<span class=\"font-bold\">Vendez-vous actuellement sur d'autres plateformes ?</span>'",
              "Réponse : Sélectionnez '<span class=\"font-bold\">Non, je n'utilise aucune plateforme</span>'",
              "Cliquez sur '<span class=\"font-bold\">Suivant</span>'",
            ],
          },
          {
            title: "Configuration de la boutique - Étape 5",
            steps: [
              "Question : '<span class=\"font-bold\">Que prévoyez-vous de vendre ?</span>'",
              "Réponse : Sélectionnez '<span class=\"font-bold\">Produits que j'achète ou fabrique moi-même</span>'",
              "Cliquez sur '<span class=\"font-bold\">Suivant</span>'",
            ],
          },
          {
            title: "Configuration de l'abonnement",
            steps: [
              "Page : '<span class=\"font-bold\">Commencez gratuitement. Continuez pour 1 €.</span>'",
              "Cliquez sur '<span class=\"font-bold\">Passer, je déciderai plus tard</span>'",
            ],
          },
        ],
      },
      {
        id: 4,
        title: "Configuration du nom de la boutique",
        description: "Personnalisation des paramètres de la boutique",
        instructions: [
          "Vous êtes maintenant dans le tableau de bord de la nouvelle boutique",
          "Dans la barre latérale gauche, cliquez sur '<span class=\"font-bold\">Paramètres</span>'",
          {
            title: "Modification du nom de la boutique",
            steps: [
              "Dans la section '<span class=\"font-bold\">Détails de la boutique</span>', placez votre souris sur '<span class=\"font-bold\">Ma boutique</span>' et cliquez sur l'icône crayon qui apparaît",
              "Dans le champ '<span class=\"font-bold\">Nom de la boutique</span>', saisissez :",
              {
                type: "shop_name_copy",
                label: "Nom de la boutique",
                value: shop?.nomProjet || shop?.name || "Nom du projet",
              },
              "Cliquez sur le bouton noir '<span class=\"font-bold\">Enregistrer</span>'",
              "Cliquez sur la croix en haut à droite pour fermer la modal",
            ],
          },
        ],
      },
      {
        id: 5,
        title: "Récupération de l'URL d'administration",
        description: "Configuration finale de la boutique",
        instructions: [
          "Une fois de retour dans le tableau de bord, copiez l'URL d'administration de la boutique depuis la barre d'adresse du navigateur",
          "L'URL devrait ressembler à : '<span class=\"font-bold\">https://votre-boutique.myshopify.com/admin</span>' ou '<span class=\"font-bold\">https://admin.shopify.com/store/votre-boutique</span>'",
          {
            title: "Saisie de l'URL d'administration",
            steps: [
              {
                type: "admin_url_form",
                instruction:
                  "Collez l'URL d'administration de votre nouvelle boutique ci-dessous :",
              },
            ],
          },
        ],
      },
    ];

    return list;
  }, [shop, email, partnerPassword]);

  const markStepCompleted = (stepId) => {
    setCompletedSteps((prev) => new Set(prev).add(stepId));
  };

  const getCurrentStep = () => steps.find((step) => step.id === currentStep);

  if (!isOpen || !shop) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-green-50 to-blue-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Assistant de Création de Boutique Shopify
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Boutique:{" "}
              <span className="font-semibold">
                {shop.nomProjet || shop.name}
              </span>
            </p>
          </div>
          <button
            onClick={() => {
              setShopifyOpened(false);
              onClose();
            }}
            className="text-gray-500 hover:text-gray-800 transition-colors p-2 rounded-full hover:bg-gray-100"
          >
            <FaTimes size={24} />
          </button>
        </div>

        <div className="flex-grow flex min-h-0">
          {/* Left Sidebar - Instructions */}
          <div className="w-1/2 bg-gray-50 border-r p-6 overflow-y-auto flex-shrink-0">
            {/* Progress Overview */}
            <div className="bg-white rounded-lg p-4 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">Progression</h3>
              <div className="space-y-2">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-center space-x-3 p-2 rounded-md ${
                      currentStep === step.id
                        ? "bg-blue-100 border border-blue-200"
                        : completedSteps.has(step.id)
                          ? "bg-green-50"
                          : ""
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                        completedSteps.has(step.id)
                          ? "bg-green-500 text-white"
                          : currentStep === step.id
                            ? "bg-blue-500 text-white"
                            : "bg-gray-300 text-gray-600"
                      }`}
                    >
                      {completedSteps.has(step.id) ? (
                        <FaCheckCircle size={12} />
                      ) : (
                        step.id
                      )}
                    </div>
                    <span
                      className={`text-sm ${
                        currentStep === step.id ? "font-semibold" : ""
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Current Step Instructions */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Étape {currentStep}: {getCurrentStep()?.title}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {getCurrentStep()?.description}
              </p>

              {/* Loading indicator for credentials */}
              {currentStep === 1 && isLoadingPartner && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                    <span className="text-sm text-blue-800">
                      Chargement des identifiants Shopify...
                    </span>
                  </div>
                </div>
              )}

              {/* Error indicator for credentials */}
              {currentStep === 1 && partnerError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-red-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-2">
                      <p className="text-sm text-red-800">
                        <strong>Erreur de chargement des identifiants:</strong>{" "}
                        {partnerError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {getCurrentStep()?.instructions?.map(
                  (instruction, instrIndex) => {
                    if (typeof instruction === "string") {
                      return (
                        <div
                          key={instrIndex}
                          className="text-sm text-gray-700"
                          dangerouslySetInnerHTML={{ __html: instruction }}
                        />
                      );
                    } else if (instruction.title) {
                      return (
                        <div
                          key={instrIndex}
                          className="border-l-4 border-blue-400 pl-4"
                        >
                          <h4 className="font-medium text-gray-800 mb-2">
                            {instruction.title}
                          </h4>
                          <div className="space-y-2">
                            {instruction.steps?.map((step, stepIndex) => {
                              if (typeof step === "string") {
                                return (
                                  <div
                                    key={stepIndex}
                                    className="text-sm text-gray-700"
                                    dangerouslySetInnerHTML={{ __html: step }}
                                  />
                                );
                              } else if (step.type === "shop_name_copy") {
                                return (
                                  <div
                                    key={`shop-name-${stepIndex}`}
                                    className="mt-2"
                                  >
                                    <label className="text-sm font-medium text-gray-700 block mb-1">
                                      {step.label}
                                    </label>
                                    <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                      <span className="flex-1 text-sm text-gray-800 break-all">
                                        {step.value}
                                      </span>
                                      <button
                                        onClick={() =>
                                          navigator.clipboard.writeText(
                                            step.value
                                          )
                                        }
                                        className="text-blue-600 hover:text-blue-800 ml-2"
                                        title="Copier"
                                      >
                                        <FaCopy />
                                      </button>
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "admin_url_form") {
                                return (
                                  <div
                                    key={`admin-url-form-${stepIndex}`}
                                    className="mt-4 p-4 bg-white border rounded-lg space-y-4"
                                  >
                                    <p className="text-sm text-gray-700">
                                      {step.instruction}
                                    </p>
                                    <div>
                                      <label
                                        htmlFor="adminUrl"
                                        className="block text-sm font-medium text-gray-700"
                                      >
                                        URL d'administration de la boutique
                                      </label>
                                      <input
                                        type="url"
                                        id="adminUrl"
                                        value={adminUrl}
                                        onChange={(e) =>
                                          setAdminUrl(e.target.value)
                                        }
                                        placeholder="https://votre-boutique.myshopify.com/admin"
                                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                      />
                                    </div>
                                    <div className="pt-2">
                                      <button
                                        onClick={handleSaveAdminUrl}
                                        disabled={
                                          isSaving ||
                                          saveSuccess ||
                                          !adminUrl.trim()
                                        }
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                          saveSuccess
                                            ? "bg-green-600 text-white"
                                            : isSaving || !adminUrl.trim()
                                              ? "bg-gray-400 text-white cursor-not-allowed"
                                              : "bg-blue-600 text-white hover:bg-blue-700"
                                        }`}
                                      >
                                        {isSaving ? (
                                          <>
                                            <FaSpinner className="animate-spin inline mr-2" />
                                            Enregistrement...
                                          </>
                                        ) : saveSuccess ? (
                                          <>
                                            <FaCheckCircle className="inline mr-2" />
                                            Enregistré
                                          </>
                                        ) : (
                                          "Enregistrer l'URL"
                                        )}
                                      </button>
                                    </div>
                                    {saveError && (
                                      <div className="text-red-600 text-sm mt-2">
                                        <FaExclamationCircle className="inline mr-1" />
                                        {saveError}
                                      </div>
                                    )}
                                    {saveSuccess && (
                                      <div className="text-green-600 text-sm mt-2">
                                        <FaCheckCircle className="inline mr-1" />
                                        URL d'administration enregistrée avec
                                        succès
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>

                          {/* Credential Display Boxes - Only for "Première connexion" */}
                          {currentStep === 1 &&
                            instruction.title === "Première connexion" &&
                            (email || partnerPassword) && (
                              <div className="mt-6 space-y-4">
                                {/* Email Box */}
                                {email && (
                                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <label className="text-sm font-medium text-blue-800 block mb-2">
                                      Email Shopify
                                    </label>
                                    <div className="flex items-center border rounded-md px-3 py-2 bg-white">
                                      <span className="flex-1 text-sm text-blue-900 break-all">
                                        {email}
                                      </span>
                                      <button
                                        onClick={() =>
                                          navigator.clipboard.writeText(email)
                                        }
                                        className="text-blue-600 hover:text-blue-800 ml-2 p-1 rounded hover:bg-blue-100"
                                        title="Copier l'email"
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
                                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Password Box */}
                                {partnerPassword && (
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <label className="text-sm font-medium text-green-800 block mb-2">
                                      Mot de passe Shopify
                                    </label>
                                    <div className="flex items-center border rounded-md px-3 py-2 bg-white">
                                      <span className="flex-1 text-sm text-green-900 break-all">
                                        {showPassword
                                          ? partnerPassword
                                          : "••••••••••••••••"}
                                      </span>
                                      <div className="flex items-center ml-2 space-x-1">
                                        <button
                                          onMouseDown={() =>
                                            setShowPassword(true)
                                          }
                                          onMouseUp={() =>
                                            setShowPassword(false)
                                          }
                                          onMouseLeave={() =>
                                            setShowPassword(false)
                                          }
                                          className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-100"
                                          title="Maintenir pour voir le mot de passe"
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
                                        <button
                                          onClick={() =>
                                            navigator.clipboard.writeText(
                                              partnerPassword
                                            )
                                          }
                                          className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-100"
                                          title="Copier le mot de passe"
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
                                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                            />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      );
                    }
                    return null;
                  }
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="space-y-3 mt-6">
              <div className="flex space-x-3">
                {currentStep > 1 && (
                  <button
                    onClick={handlePreviousStep}
                    className="flex-1 py-2 px-4 bg-gray-600 text-white rounded-md text-sm font-medium hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <FaArrowRight className="transform rotate-180" size={12} />
                    <span>Étape précédente</span>
                  </button>
                )}
                {currentStep < steps.length ? (
                  <button
                    onClick={handleNextStep}
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <span>Étape suivante</span>
                    <FaArrowRight size={12} />
                  </button>
                ) : (
                  !isFullyCompleted && (
                    <button
                      onClick={handleFinalizeShop}
                      disabled={isFinalizing || !saveSuccess}
                      className={`flex-1 py-2 px-4 rounded-md text-sm font-medium flex items-center justify-center space-x-2 ${
                        isFinalizing || !saveSuccess
                          ? "bg-gray-400 text-white cursor-not-allowed"
                          : "bg-green-600 text-white hover:bg-green-700"
                      } transition-colors`}
                    >
                      {isFinalizing && (
                        <FaSpinner className="animate-spin -ml-1 mr-3 h-4 w-4" />
                      )}
                      <span>
                        {isFinalizing
                          ? "Finalisation..."
                          : "Finaliser la création"}
                      </span>
                    </button>
                  )
                )}
              </div>
              {finalizeError && (
                <div className="text-red-600 text-sm">
                  <FaExclamationCircle className="inline mr-1" />
                  {finalizeError}
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Information */}
          <div className="w-1/2 p-6 flex items-center justify-center">
            {isFullyCompleted ? (
              <div className="text-center max-w-md space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <FaCheckCircle className="text-green-600" size={32} />
                </div>
                <h4 className="text-xl font-semibold text-green-800">
                  Boutique créée avec succès !
                </h4>
                <p className="text-sm text-gray-700">
                  Votre boutique Shopify{" "}
                  <strong>{shop.nomProjet || shop.name}</strong> a été créée et
                  configurée avec succès. Vous pouvez maintenant commencer à
                  ajouter vos produits et configurer votre boutique.
                </p>
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Terminer
                </button>
              </div>
            ) : (
              <div className="text-center max-w-md space-y-4">
                <div className="flex items-start space-x-2 mb-6 bg-yellow-50 p-4 rounded-md">
                  <FaExclamationTriangle
                    className="text-yellow-600 mt-0.5 flex-shrink-0"
                    size={16}
                  />
                  <p className="text-sm text-yellow-800 text-left">
                    <strong>Important :</strong> Suivez les étapes dans
                    l&apos;ordre et utilisez la page Shopify ouverte dans le
                    nouvel onglet pour effectuer les actions demandées.
                  </p>
                </div>
                <h4 className="text-xl font-semibold text-blue-800">
                  Création de boutique Shopify
                </h4>
                <p className="text-sm text-gray-700">
                  Nous allons vous guider à travers le processus de création
                  d&apos;une nouvelle boutique Shopify. Utilisez les
                  instructions à gauche pour suivre les étapes.
                </p>
                <p className="text-sm text-gray-700">
                  Cliquez sur le bouton ci-dessous pour ouvrir la page de
                  connexion Shopify dans un nouvel onglet.
                </p>
                <button
                  onClick={openShopifyPages}
                  disabled={shopifyOpened}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    shopifyOpened
                      ? "bg-green-600 text-white cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {shopifyOpened
                    ? "Page Shopify ouverte"
                    : "Ouvrir la page Shopify"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopifyCreationWizardModal;
