import React, { useState, useEffect, useMemo } from "react";
import {
  FaTimes,
  FaArrowRight,
  FaCheckCircle,
  FaExclamationTriangle,
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaSpinner,
  FaDownload,
  FaSearch, // New icon for search
  FaExclamationCircle, // New icon for notices
} from "react-icons/fa";
import NotificationModal from "../../shared/NotificationModal";

const ParametrizationWizardModal = ({ isOpen, onClose, shop }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [shopifyOpened, setShopifyOpened] = useState(false);
  // Shopify Partner credentials (fetched)
  const [partnerCredentials, setPartnerCredentials] = useState(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState(true);
  const [partnerError, setPartnerError] = useState(null);

  // State for fetched PayPal credentials
  const [paypalCredentials, setPaypalCredentials] = useState(null);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(true);
  const [credentialError, setCredentialError] = useState(null);

  // NEW: Normalize payment type coming from backend (could be `payment`, `Payement`, etc.)
  const paymentTypeRaw = (shop?.Payement || shop?.payment || "").toLowerCase();
  const isVendeur = paymentTypeRaw === "vendeur";

  const email = partnerCredentials?.email || "";
  const partnerPassword = partnerCredentials?.password || "";
  const [showPassword, setShowPassword] = useState(false);
  const [showPayPalPassword, setShowPayPalPassword] = useState(false);

  // Mondial Relay credential states
  const [mondialCredentials, setMondialCredentials] = useState(null);
  const [isLoadingMondial, setIsLoadingMondial] = useState(true);
  const [mondialError, setMondialError] = useState(null);
  const [showMondialPassword, setShowMondialPassword] = useState(false);

  // New state for API credentials
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [saveKeysError, setSaveKeysError] = useState(null);
  const [saveKeysSuccess, setSaveKeysSuccess] = useState(false);
  const [isFullyCompleted, setIsFullyCompleted] = useState(false); // New state for final completion
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);

  // Modal state for credentials input
  const [modal, setModal] = useState({ open: false });

  // State for API permissions checkboxes
  const [checkedPermissions, setCheckedPermissions] = useState({
    write_products: false,
    read_products: false,
    write_themes: false,
    read_themes: false,
    write_content: false,
    read_content: false,
  });

  // Determine vendeur/mandataire and Mondial Relay once per render
  const hasMondialRelay =
    shop?.moduleMondialRelay === true ||
    shop?.moduleMondialeRelay === true ||
    (typeof shop?.moduleMondialRelay === "string" &&
      ["oui", "yes", "true", "1"].includes(
        shop.moduleMondialRelay.toLowerCase()
      ));

  // Reset shopifyOpened when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Reset wizard state when the modal is closed
      setCurrentStep(1);
      setCompletedSteps(new Set());
      setIsFullyCompleted(false);
      setShopifyOpened(false);

      // Reset API credential form fields & feedback
      setApiKey("");
      setApiSecret("");
      setAccessToken("");
      setAdminUrl("");
      setSaveKeysError(null);
      setSaveKeysSuccess(false);

      // Reset loading / error states
      setIsSavingKeys(false);
      setIsLoadingMondial(false);
      setMondialCredentials(null);
      setMondialError(null);

      setPartnerCredentials(null);
      setIsLoadingPartner(false);

      // Reset modal state
      setModal({ open: false });
      setPartnerError(null);

      setIsFinalizing(false);
      setFinalizeError(null);

      // Reset PayPal credentials loading state
      setIsLoadingCredentials(false);
      setPaypalCredentials(null);
      setCredentialError(null);

      // Reset API permissions checkboxes
      setCheckedPermissions({
        write_products: false,
        read_products: false,
        write_themes: false,
        read_themes: false,
        write_content: false,
        read_content: false,
      });
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

      // Function to fetch PayPal credentials from backend
      const fetchPaypalCredentials = async () => {
        try {
          setIsLoadingCredentials(true);
          setCredentialError(null);
          const response = await fetch(
            "/api/internal/config/paypal-credentials"
          );
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || "Failed to fetch credentials");
          }
          const data = await response.json();
          setPaypalCredentials(data.credentials);
        } catch (error) {
          setCredentialError(error.message);
        } finally {
          setIsLoadingCredentials(false);
        }
      };

      // Function to fetch Mondial Relay credentials from backend (only if feature enabled)
      const fetchMondialCredentials = async () => {
        try {
          setIsLoadingMondial(true);
          setMondialError(null);
          const response = await fetch(
            "/api/internal/config/mondialrelay-credentials"
          );
          if (!response.ok) {
            const data = await response.json();
            throw new Error(
              data.message || "Failed to fetch Mondial Relay credentials"
            );
          }
          const data = await response.json();
          setMondialCredentials(data.credentials);
        } catch (error) {
          setMondialError(error.message);
        } finally {
          setIsLoadingMondial(false);
        }
      };

      fetchPaypalCredentials();
      if (hasMondialRelay) {
        fetchMondialCredentials();
      }
    }
  }, [isOpen, hasMondialRelay]);

  useEffect(() => {
    // console.log(
    //   "[FRONTEND DEBUG] Mondial credentials state updated:",
    //   mondialCredentials
    // );
  }, [mondialCredentials]);

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

  const handleSaveApiKeys = async () => {
    if (!apiKey || !apiSecret || !accessToken) {
      setSaveKeysError("Veuillez remplir tous les champs de clés API.");
      return;
    }
    setIsSavingKeys(true);
    setSaveKeysError(null);
    setSaveKeysSuccess(false);
    try {
      const response = await fetch(
        `/api/internal/shops/${shop._id}/api-credentials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey,
            apiSecret,
            accessToken,
            adminUrl:
              adminUrl ||
              `https://${shop.shopifyDomain || shop.name || "your-shop"}.myshopify.com/admin`,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to save API keys.");
      }
      setSaveKeysSuccess(true);
      // Optionally, mark the current API step as completed dynamically
      const apiStep = steps.find((s) => s.title === "Paramétrage des API");
      if (apiStep) {
        markStepCompleted(apiStep.id);
      }
    } catch (error) {
      setSaveKeysError(error.message);
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handlePermissionChange = (permissionId, checked) => {
    setCheckedPermissions((prev) => {
      const newPermissions = {
        ...prev,
        [permissionId]: checked,
      };

      // If a write permission is checked, auto-check its corresponding read permission
      if (checked && permissionId.startsWith("write_")) {
        const readPermission = permissionId.replace("write_", "read_");
        newPermissions[readPermission] = true;
      }

      return newPermissions;
    });
  };

  const handleThemeConfiguration = async () => {
    try {
      setIsFinalizing(true);
      setFinalizeError(null);

      const response = await fetch(
        `/api/internal/shops/${encodeURIComponent(shop._id)}/configure-theme`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const isJson = response.headers
        .get("content-type")
        ?.includes("application/json");
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        // Check if it's a missing credentials error
        if (isJson && data.errorType === "MISSING_CREDENTIALS") {
          // Show modal to collect missing credentials
          showCredentialsModal(data.missingFields, data.shopId);
          return;
        }

        const errMsg = isJson ? data.message : data;
        throw new Error(errMsg || "Échec de la configuration du thème.");
      }

      // Show success message
      // Show success message with theme details
      const themeInfo = data.themeName
        ? `\n\nThème utilisé : ${data.themeName} (${data.themeRole || "N/A"})`
        : "";
      setModal({
        open: true,
        type: "success",
        title: "✅ Configuration réussie",
        message: `Configuration du thème appliquée avec succès !${themeInfo}\n\nVous pouvez maintenant cliquer sur "Finaliser" pour terminer le paramétrage.`,
        onClose: () => setModal({ open: false }),
        confirmText: "Fermer",
      });
    } catch (error) {
      console.error("Error configuring theme:", error);
      setModal({
        open: true,
        type: "error",
        title: "❌ Erreur de configuration",
        message: "Erreur lors de la configuration du thème: " + error.message,
        onClose: () => setModal({ open: false }),
        confirmText: "Fermer",
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  const showCredentialsModal = (missingFields, shopId) => {
    const modal = {
      open: true,
      type: "info",
      title: "🔧 Configuration Shopify requise",
      message: (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Pour configurer le thème, nous avons besoin des informations Shopify
            suivantes :
          </p>

          <div className="space-y-3">
            {missingFields.accessToken && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Access Token Shopify *
                </label>
                <input
                  id="shopify-access-token"
                  type="text"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Créez une app privée dans votre Shopify Admin → Settings →
                  Apps and sales channels → Develop apps
                </p>
              </div>
            )}

            {missingFields.domain && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Domaine Shopify *
                </label>
                <input
                  id="shopify-domain"
                  type="text"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="votre-boutique"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Le nom de votre boutique (sans .myshopify.com)
                </p>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <h4 className="text-sm font-medium text-blue-800 mb-2">
              Instructions :
            </h4>
            <ol className="text-xs text-blue-700 space-y-1">
              <li>1. Allez dans votre Shopify Admin</li>
              <li>2. Settings → Apps and sales channels → Develop apps</li>
              <li>3. Créez une nouvelle app privée</li>
              <li>
                4. Activez les scopes : <code>read_themes</code>,{" "}
                <code>write_themes</code>
              </li>
              <li>5. Copiez l'access token généré</li>
            </ol>
          </div>
        </div>
      ),
      onClose: () => setModal({ open: false }),
      onConfirm: async () => {
        const accessToken = document
          .getElementById("shopify-access-token")
          ?.value.trim();
        const shopifyDomain = document
          .getElementById("shopify-domain")
          ?.value.trim();

        if (!accessToken || !shopifyDomain) {
          alert("Veuillez remplir tous les champs requis");
          return;
        }

        try {
          const response = await fetch(
            `/api/internal/shops/${encodeURIComponent(shopId)}/save-credentials-and-configure-theme`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                accessToken,
                shopifyDomain,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.message || "Erreur lors de la sauvegarde et configuration"
            );
          }

          // Show success message
          alert("Configuration du thème appliquée avec succès !");
          setModal({ open: false });
        } catch (error) {
          console.error(
            "Error saving credentials and configuring theme:",
            error
          );
          alert("Erreur : " + error.message);
        }
      },
      confirmText: "💾 Sauvegarder et Configurer",
      cancelText: "Annuler",
    };

    setModal(modal);
  };

  const handleCloseWithUpdate = async () => {
    try {
      // Update shop state to "parametre" when closing the assistant
      const response = await fetch(
        `/api/internal/shops/${encodeURIComponent(shop._id)}/mark-parametrized`,
        {
          method: "PUT",
        }
      );

      if (response.ok) {
        console.log("Shop successfully marked as parametrized");
      } else {
        console.warn(
          "Failed to mark shop as parametrized, but continuing to close"
        );
      }
    } catch (error) {
      console.error("Error marking shop as parametrized:", error);
      // Continue closing even if the update fails
    } finally {
      onClose();
    }
  };

  const handleFinalizeShop = async () => {
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      const response = await fetch(
        `/api/internal/shops/${encodeURIComponent(shop._id)}/mark-parametrized`,
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
              "Vous accéderez alors au tableau de bord administrateur de la boutique",
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
        title: "Connexion à la boutique",
        description: `Connexion à la boutique ${shop?.name || ""}`,
        instructions: [
          "Cliquez sur le nom de la boutique actuelle avec l'icône boutique (élément le plus à droite en haut de la page)",
          "Dans le menu déroulant, cliquez sur '<span class=\"font-bold\">Toutes les boutiques</span>' - un nouvel onglet s'ouvrira",
          {
            title: "Recherche de la boutique",
            steps: [
              "Dans la barre de recherche, saisissez le nom de la boutique ou son domaine :",
              {
                type: "shop_name",
                value: shop?.name || "",
              },
              {
                type: "separator",
                value: "OU",
              },
              {
                type: "shop_domain",
                value: shop?.shopifyDomain || "",
              },
              `Cliquez sur la boutique nommée '<span class="font-bold">${shop?.name || ""}</span>'`,
            ],
          },
        ],
      },
      {
        id: 3,
        title: "Configuration de base",
        description: "Configurez les paramètres essentiels de votre boutique",
        instructions: [
          "Une fois dans le tableau de bord, cliquez sur le bouton 'Paramètres' situé dans le coin inférieur gauche de la page",
          {
            title: "Configuration de l'email",
            steps: [
              "Dans la section 'Détails de la boutique', placez votre souris sur l'email 'amanda.gerard@dna-gz.com' sous '<span class=\"font-bold\">" +
                (shop?.name || "") +
                "</span>' et cliquez sur l'icône crayon qui apparaît",
              "Remplacez l'email existant par :",
              {
                type: "copy_data",
                label: "Email de la boutique",
                value: "sav.dtoc@sna-gz.com",
              },
              "Cliquez sur 'Enregistrer'",
            ],
          },
          {
            title: "Configuration de l'adresse",
            steps: [
              "De retour dans les paramètres généraux, placez votre souris sur 'Adresse de facturation' et cliquez sur l'icône crayon",
              "Remplissez les champs suivants :",
              {
                type: "copy_data",
                label: "Raison sociale",
                value: "SNA GZ",
              },
              {
                type: "copy_data",
                label: "Adresse",
                value: "ZA de sainte anne",
              },
              {
                type: "copy_data",
                label: "Code postal",
                value: "61190",
              },
              {
                type: "copy_data",
                label: "Ville",
                value: "Tourouvre au perche",
              },
              "Cliquez sur 'Enregistrer'",
            ],
          },
          {
            title: "Configuration de la référence de commande",
            steps: [
              "De retour dans la page des paramètres généraux, faites défiler vers le bas jusqu'à la section 'Référence de commande'",
              "Remplissez le champ 'Préfixe' avec l'information suivante :",
              {
                type: "shop_prefix",
                label: "Préfixe de commande",
                value: shop?.name || shop?.nomProjet || "SHOP",
              },
              "Cliquez sur 'Enregistrer'",
            ],
          },
        ],
      },
      {
        id: 4,
        title: "Paramétrage des forfaits",
        description: "Configuration du forfait Shopify",
        instructions: [
          "Dans les paramètres, cliquez sur '<span class=\"font-bold\">Forfait</span>' dans la barre latérale gauche (juste en dessous de la barre '<span class=\"font-bold\">Rechercher</span>' et de l'icône '<span class=\"font-bold\">Général</span>')",
          "Cliquez sur le bouton noir '<span class=\"font-bold\">Choisir un forfait</span>'",
          "Sélectionnez '<span class=\"font-bold\">Grow</span>' en cliquant sur '<span class=\"font-bold\">Sélectionner Grow</span>'",
          "Cliquez sur le bouton '<span class=\"font-bold\">PayPal</span>' puis sur la boîte '<span class=\"font-bold\">Pay with PayPal</span>' avec le logo PayPal",
          {
            title: "Connexion PayPal",
            steps: [
              {
                type: "account_type",
                title: isVendeur ? "Compte Vendeur" : "Compte Mandataire",
                credentials: {
                  type: "env",
                  email_key: isVendeur
                    ? "PAYPAL_VENDEUR_EMAIL"
                    : "PAYPAL_MANDATAIRE_EMAIL",
                  password_key: isVendeur
                    ? "PAYPAL_VENDEUR_PASSWORD"
                    : "PAYPAL_MANDATAIRE_PASSWORD",
                },
              },
              "Une fois connecté, vous recevrez un code de vérification sur le numéro :",
              {
                type: "phone_number",
                label: "Téléphone de Clément",
                value: "+33 6 ** ** 73 24",
              },
              "Saisissez le code reçu et confirmez le paiement",
            ],
          },
        ],
      },
      {
        id: 5,
        title: "Configuration des Moyens de Paiement",
        description: "Finalisez la configuration de Shopify Payments",
        instructions: [
          "De retour dans les paramètres, cliquez sur la section 'Moyens de paiement'.",
          "Cliquez sur le bouton noir 'Terminer la configuration du compte'.",
          "Cliquez sur le bouton noir 'Soumettre les informations'.",
          {
            title: "Configurer Shopify Payments",
            steps: [
              "Pour la question 'J'exploite ma boutique en tant que :', sélectionnez 'Entreprise immatriculée', puis dans le menu déroulant, sélectionnez 'Société privée'.",
              "Cliquez sur 'Suivant'.",
            ],
          },
          {
            title: "Informations sur l'entreprise",
            steps: [
              {
                type: "copy_data",
                label: "Dénomination sociale",
                value: "SNA GZ",
              },
              { type: "copy_data", label: "SIRET", value: "840 379 499 00022" },
              {
                type: "copy_data",
                label: "Numéro de TVA",
                value: "FR63840379499",
              },
              {
                type: "copy_data",
                label: "Numéro de téléphone",
                value: "+33 2 33 85 15 15",
              },
              {
                type: "copy_data",
                label: "Adresse",
                value: "171 Quai de Valmy",
              },
              { type: "copy_data", label: "Code postal", value: "75010" },
              { type: "copy_data", label: "Ville", value: "Paris" },
              "Cliquez sur 'Suivant'.",
            ],
          },
          {
            title: "Secteur d'activité",
            steps: [
              "Dans 'Catégorie', sélectionnez 'Services professionnels'.",
              "Dans 'Sous-catégorie', sélectionnez 'Entreposage et stockage'.",
              {
                type: "copy_data",
                label: "Numéro de téléphone de la boutique",
                value: "+33 2 33 85 15 15",
              },
              "Cliquez sur 'Suivant'.",
            ],
          },
          {
            title: "Représentant du compte",
            steps: [
              { type: "copy_data", label: "Prénom", value: "Boris" },
              { type: "copy_data", label: "Nom de famille", value: "Ducteil" },
              {
                type: "checkbox_group",
                items: [
                  "Cette personne détient 25% ou plus des capitaux propres de l'entreprise",
                ],
              },
              { type: "copy_data", label: "Participation (%)", value: "100" },
              {
                type: "checkbox_group",
                items: [
                  "Cette personne est un(e) dirigeant(e) de l’entreprise.",
                  "Cette personne siège au conseil d’administration de l’entreprise.",
                ],
              },
              {
                type: "copy_data",
                label: "Date de naissance (JJ/MM/AAAA)",
                value: "02/01/1980",
              },
              { type: "copy_data", label: "Nationalité", value: "Française" },
              { type: "copy_data", label: "Poste", value: "Dirigeant" },
              {
                type: "copy_data",
                label: "E-mail",
                value: "boris.ducteil@sna-gz.com",
              },
              "Laissez le champ 'SPI' vide.",
              {
                type: "copy_data",
                label: "Numéro de téléphone",
                value: "+33 2 33 85 15 15",
              },
              {
                type: "copy_data",
                label: "Adresse",
                value: "63 Avenue du Maréchal Foch, Deuil-la-Barre",
              },
              { type: "copy_data", label: "Code postal", value: "95170" },
              { type: "copy_data", label: "Ville", value: "Deuil-la-Barre" },
              "Cliquez sur 'Suivant'.",
            ],
          },
          "Dans l'écran 'Participation au capital', cliquez sur 'Suivant' sans rien modifier.",
          "Dans l'écran 'Conseil d'administration', cliquez sur 'Suivant' sans rien modifier.",
          "Dans l'écran 'Dirigeants', cliquez sur 'Suivant' sans rien modifier.",
          {
            title: "Importer les documents",
            steps: [
              {
                type: "file_download",
                label:
                  "Cliquez sur 'Importer' pour la 'Preuve d'immatriculation'",
                select: "Preuve d'immatriculation de l'entreprise",
                file: "Extrait KBIS - SNA GZ.pdf",
                buttonText: "Télécharger Extrait KBIS",
              },
              "Cliquez sur 'Confirmer'.",
              {
                type: "file_download",
                label:
                  "Cliquez sur 'Importer' pour le 'Justificatif de domicile'",
                select: "Relevé bancaire ou facture de services publics",
                file: "Justificatif de domicile 23 juil. 2024.pdf",
                buttonText: "Télécharger Justificatif",
              },
              "Cliquez sur 'Terminé'.",
              {
                type: "file_download",
                label: "Cliquez sur 'Importer' pour la 'Pièce d'identité'",
                select: "Passeport",
                file: "Passport_Boris.jpg",
                buttonText: "Télécharger Passeport",
              },
              "Cliquez sur 'Terminé'.",
              "Enfin, cliquez sur 'Confirmer' puis sur 'Soumettre pour vérification'.",
            ],
          },
          {
            title: "Ajouter un compte bancaire",
            steps: [
              "Cliquez sur le bouton 'Ajouter un compte bancaire'.",
              { type: "iban" },
              "Cliquez sur 'Enregistrer'.",
            ],
          },
        ],
      },
      {
        id: 6,
        title: "Configuration des Marchés",
        description: "Configurez les marchés Shopify pour votre boutique",
        instructions: [
          'Dans les <span class="font-bold">Paramètres</span>, allez dans la section <span class="font-bold">Marchés</span> sur la barre latérale gauche.',
          {
            title: "Marché Union Européenne",
            steps: [
              'Cliquez sur le bouton <span class="font-bold">+</span> à côté de <span class="font-bold">Créer le marché Union européenne</span>.',
              "Cliquez sur l'icône en forme de crayon pour modifier le marché.",
              'Dans la barre de recherche, ajoutez les régions suivantes une par une : <span class="font-bold">La Réunion</span>, <span class="font-bold">Martinique</span>, <span class="font-bold">Guadeloupe</span>.',
              "Cochez les cases correspondantes pour les ajouter au marché.",
              'Cliquez sur <span class="font-bold">Terminé</span>, puis sur <span class="font-bold">Enregistrer</span>.',
            ],
          },
          {
            title: "Marché International",
            steps: [
              'Retournez à la section <span class="font-bold">Marchés</span>.',
              'Cliquez sur le bouton <span class="font-bold">+</span> à droite de <span class="font-bold">Créer le marché International</span>.',
              'Cliquez sur <span class="font-bold">Enregistrer</span> pour créer le marché international.',
            ],
          },
        ],
      },
    ];

    // Conditionally add Mondial Relay configuration
    if (hasMondialRelay) {
      list.push({
        id: list.length + 1,
        title: "Configuration du Module Mondial Relay",
        description: "Installez et connectez l'application Mondial Relay",
        instructions: [
          {
            title: "Installation et configuration",
            steps: [
              "Depuis le tableau de bord, cliquez sur la flèche '>' à droite de la section Applications, puis appuyez sur Entrée pour accéder au Shopify App Store.",
              'Dans la barre de recherche, tapez <span class="font-bold">Mondial Relay InPost Officiel</span>.',
              {
                type: "image",
                src: "/api/internal/files/download/1ce5021cbfb5eff03e8af1d8bbfed6b9_512x512.jpg",
                alt: "Mondial Relay App Icon",
              },
              'Cliquez sur l\'icône puis sur <span class="font-bold">Installer</span>.',
              'Une fois de retour dans Shopify, cliquez à nouveau sur <span class="font-bold">Installer</span>.',
              "Vous serez redirigé vers le site Mondial Relay.",
              "Nous allons maintenant remplir le formulaire de configuration avec les données suivantes :",
              {
                type: "form_section",
                title: "Section Votre compte Mondial Relay",
                fields: [
                  {
                    type: "copy_data",
                    label: "Identifiant Mondial Relay",
                    value: "benjamin.saillard@snadisc.com",
                  },
                  {
                    type: "env_data",
                    label: "Code enseigne",
                    envKey: "codeEnseigne",
                  },
                  {
                    type: "env_data",
                    label: "Clé privée",
                    envKey: "clePrivee",
                  },
                  {
                    type: "env_data",
                    label: "Code Marque",
                    envKey: "codeMarque",
                  },
                ],
              },
              {
                type: "form_section",
                title: "Section Votre adresse d'expédition",
                fields: [
                  {
                    type: "copy_data",
                    label: "Nom Entreprise",
                    value: "SNA GZ",
                  },
                  {
                    type: "copy_data",
                    label: "Adresse société",
                    value: "171 Quai de Valmy",
                  },
                  {
                    type: "copy_data",
                    label: "Code postal",
                    value: "75010",
                  },
                  {
                    type: "copy_data",
                    label: "Ville",
                    value: "Paris",
                  },
                  {
                    type: "copy_data",
                    label: "Pays",
                    value: "France",
                  },
                  {
                    type: "copy_data",
                    label: "Email de contact",
                    value: "benjamin.saillard@snadisc.com",
                  },
                  {
                    type: "copy_data",
                    label: "Téléphone",
                    value: "+33 2 33 85 15 15",
                  },
                ],
              },
              'Cliquez sur <span class="font-bold">Valider</span>.',
              'Vous serez redirigé vers une page de validation. Cochez <span class="font-bold">J\'accepte les Conditions générales de vente et la politique de confidentialité</span>.',
              'Cliquez sur <span class="font-bold">Activer l\'abonnement</span>.',
              'Vous serez redirigé vers Shopify. Cliquez sur le bouton noir <span class="font-bold">Approuver</span> pour valider le module Mondial Relay pour 34,99 USD par mois.',
              "Vous pouvez maintenant retourner au tableau de bord Shopify.",
            ],
          },
        ],
      });
    }

    // --- API Parametrization Step (always after Mondial Relay / or directly after step 6) ---
    list.push({
      id: list.length + 1,
      title: "Paramétrage des API",
      description: "Création d'une application personnalisée pour l'accès API.",
      instructions: [
        {
          title: "Navigation vers le développement d'applications",
          steps: [
            "Dans le tableau de bord Shopify, cliquez sur la flèche `>` à droite de `Applications`.",
            "Cliquez sur l'icône en forme de roue dentée (⚙️) à gauche de `Paramètres des applications et canaux de vente` qui apparaît sous la barre de recherche.",
            "Cliquez sur le bouton `Développer des applications`.",
          ],
        },
        {
          title: "Autorisation du développement",
          steps: [
            "Cliquez sur le premier bouton noir `Autoriser le développement d'applications personnalisées`.",
            "Confirmez en cliquant sur le deuxième bouton noir `Autoriser le développement d'applications personnalisées`.",
          ],
        },
        {
          title: "Création de l'application",
          steps: [
            "Cliquez sur le bouton noir `Créer une application`.",
            "Nommez l'application `Auto` et cliquez sur `Créer l'application`.",
          ],
        },
        {
          title: "Configuration des accès API Admin",
          steps: [
            {
              type: "notice",
              level: "warning",
              text: "Cette étape est cruciale. L'attribution des bonnes autorisations est essentielle au bon fonctionnement de nos automatisations.",
            },
            "Dans le tableau de bord de l'application, cliquez sur le bouton blanc `Configurer les niveaux d'accès Admin API`.",
            "Cochez les cases pour les autorisations suivantes. Vous pouvez utiliser la barre de recherche pour les trouver rapidement.",
            {
              type: "api_scopes",
              scopes: [
                {
                  id: "write_products",
                  label: "write_products",
                  description: "Créer et modifier les produits et collections.",
                },
                {
                  id: "read_products",
                  label: "read_products",
                  description: "Consulter les produits et collections.",
                },
                {
                  id: "write_themes",
                  label: "write_themes",
                  description:
                    "Modifier les fichiers du thème (logos, bannières, textes...).",
                },
                {
                  id: "read_themes",
                  label: "read_themes",
                  description: "Consulter les fichiers du thème.",
                },
                {
                  id: "write_content",
                  label: "write_content",
                  description:
                    "Créer et modifier le contenu de la boutique en ligne (pages, blogs...).",
                },
                {
                  id: "read_content",
                  label: "read_content",
                  description: "Consulter le contenu de la boutique en ligne.",
                },
              ],
            },
            "Une fois toutes les cases cochées, cliquez sur `Enregistrer` en haut à droite.",
          ],
        },
        {
          title: "Installation et récupération des identifiants",
          steps: [
            "Naviguez vers l'onglet `Aperçu` de votre application `Auto`.",
            "Cliquez sur le bouton noir `Installer l'application` en haut à droite, puis confirmez en cliquant sur `Installer`.",
            {
              type: "notice",
              level: "critical",
              text: "ATTENTION : Le jeton d'accès Admin API ne sera affiché qu'UNE SEULE FOIS. Copiez-le soigneusement.",
            },
            "Vous êtes maintenant dans la section `Identifiants d'API`.",
            {
              type: "api_credentials_form",
              fields: [
                {
                  id: "accessToken",
                  label: "Jeton d'accès à l'API Admin",
                  instruction:
                    "Cliquez sur `Révéler le jeton une seule fois`, puis copiez la valeur ici.",
                },
                {
                  id: "apiKey",
                  label: "Clé API",
                  instruction:
                    "Faites défiler vers le bas et copiez la `Clé API` ici.",
                },
                {
                  id: "apiSecret",
                  label: "Clé secrète de l'API",
                  instruction: "Copiez la `Clé secrète de l'API` ici.",
                },
              ],
            },
          ],
        },
      ],
    });

    // FINAL STEP – CGV & Thème
    list.push({
      id: list.length + 1,
      title: "Configuration Finale (CGV & Thème)",
      description: "Finalisation de la configuration de la boutique.",
      instructions: [
        {
          title: "Résumé et génération",
          steps: [
            {
              type: "final_step_content",
              isVendeur,
            },
          ],
        },
      ],
    });

    return list;
  }, [shop, isVendeur, hasMondialRelay]);

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
              Assistant de Paramétrage Shopify
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Boutique: <span className="font-semibold">{shop.name}</span>
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
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center space-x-2 mb-3">
                <h3 className="font-semibold text-gray-800">
                  Étape {currentStep}: {getCurrentStep()?.title}
                </h3>
                {completedSteps.has(currentStep) && (
                  <FaCheckCircle className="text-green-500" size={16} />
                )}
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {getCurrentStep()?.description}
              </p>

              <div className="space-y-3">
                <h4 className="font-medium text-gray-700 text-sm">
                  Instructions:
                </h4>
                <ol className="space-y-4">
                  {getCurrentStep()?.instructions.map((instruction, index) => {
                    if (typeof instruction === "string") {
                      const hasHtml = /<[a-z][\s\S]*>/i.test(instruction);
                      return (
                        <li
                          key={`inst-${index}`}
                          className="flex items-start space-x-2 text-sm"
                        >
                          <span className="text-blue-500 font-medium">
                            {index + 1}.
                          </span>
                          {hasHtml ? (
                            <span
                              className="text-gray-700"
                              dangerouslySetInnerHTML={{ __html: instruction }}
                            />
                          ) : (
                            <span className="text-gray-700">{instruction}</span>
                          )}
                        </li>
                      );
                    } else if (instruction.title) {
                      // For step 1's parallel paths
                      return (
                        <div
                          key={`path-${index}`}
                          className="bg-gray-50 p-4 rounded-md"
                        >
                          <h5 className="font-medium text-gray-800 mb-2">
                            {instruction.title}
                          </h5>
                          <ol className="space-y-2">
                            {instruction.steps.map((step, stepIndex) => {
                              if (typeof step === "string") {
                                const hasHtml = /<[a-z][\s\S]*>/i.test(step);
                                const textSpan = hasHtml ? (
                                  <span
                                    className="text-gray-700"
                                    dangerouslySetInnerHTML={{ __html: step }}
                                  />
                                ) : (
                                  <span className="text-gray-700">{step}</span>
                                );
                                const elements = (
                                  <li
                                    key={`sub-${stepIndex}`}
                                    className="flex items-start space-x-2 text-sm"
                                  >
                                    <span className="text-blue-500 font-medium">
                                      {stepIndex + 1}.
                                    </span>
                                    {textSpan}
                                  </li>
                                );

                                // Only inject credentials for the first path (Première connexion)
                                if (
                                  instruction.title === "Première connexion"
                                ) {
                                  if (stepIndex === 0) {
                                    return [
                                      elements,
                                      <div key="email-box" className="mt-2">
                                        <label className="text-sm font-medium text-gray-700 block mb-1">
                                          Email
                                        </label>
                                        {isLoadingPartner ? (
                                          <div className="flex items-center p-2 text-gray-500 text-sm">
                                            <FaSpinner className="animate-spin mr-2" />{" "}
                                            Chargement...
                                          </div>
                                        ) : partnerError ? (
                                          <p className="text-sm text-red-500">
                                            {partnerError}
                                          </p>
                                        ) : (
                                          <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                            <span className="flex-1 text-sm text-gray-800 break-all">
                                              {email || "Non configuré"}
                                            </span>
                                            <button
                                              onClick={() =>
                                                email &&
                                                navigator.clipboard.writeText(
                                                  email
                                                )
                                              }
                                              className={`text-blue-600 hover:text-blue-800 ml-2 ${!email ? "opacity-50 cursor-not-allowed" : ""}`}
                                              title={
                                                email
                                                  ? "Copier l'email"
                                                  : "Email non configuré"
                                              }
                                              disabled={!email}
                                            >
                                              <FaCopy />
                                            </button>
                                          </div>
                                        )}
                                      </div>,
                                    ];
                                  }
                                  if (stepIndex === 1) {
                                    return [
                                      elements,
                                      <div key="pwd-box" className="mt-2">
                                        <label className="text-sm font-medium text-gray-700 block mb-1">
                                          Mot de passe
                                        </label>
                                        {isLoadingPartner ? (
                                          <div className="flex items-center p-2 text-gray-500 text-sm">
                                            <FaSpinner className="animate-spin mr-2" />{" "}
                                            Chargement...
                                          </div>
                                        ) : partnerError ? (
                                          <p className="text-sm text-red-500">
                                            {partnerError}
                                          </p>
                                        ) : (
                                          <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                            <span className="flex-1 text-sm text-gray-800 select-all">
                                              {partnerPassword
                                                ? showPassword
                                                  ? partnerPassword
                                                  : "••••••••••••"
                                                : "Non configuré"}
                                            </span>
                                            <button
                                              onClick={() =>
                                                partnerPassword &&
                                                setShowPassword(!showPassword)
                                              }
                                              className={`text-blue-600 hover:text-blue-800 ml-2 ${!partnerPassword ? "opacity-50 cursor-not-allowed" : ""}`}
                                              title={
                                                showPassword
                                                  ? "Masquer"
                                                  : "Afficher"
                                              }
                                              disabled={!partnerPassword}
                                            >
                                              {showPassword ? (
                                                <FaEyeSlash />
                                              ) : (
                                                <FaEye />
                                              )}
                                            </button>
                                            <button
                                              onClick={() =>
                                                partnerPassword &&
                                                navigator.clipboard.writeText(
                                                  partnerPassword
                                                )
                                              }
                                              className={`text-blue-600 hover:text-blue-800 ml-2 ${!partnerPassword ? "opacity-50 cursor-not-allowed" : ""}`}
                                              title={
                                                partnerPassword
                                                  ? "Copier le mot de passe"
                                                  : "Mot de passe non configuré"
                                              }
                                              disabled={!partnerPassword}
                                            >
                                              <FaCopy />
                                            </button>
                                          </div>
                                        )}
                                      </div>,
                                    ];
                                  }
                                }
                                return elements;
                              } else if (step.type === "separator") {
                                return (
                                  <div
                                    key={`separator-${stepIndex}`}
                                    className="flex items-center justify-center my-2"
                                  >
                                    <span className="font-bold text-gray-700">
                                      {step.value}
                                    </span>
                                  </div>
                                );
                              } else if (
                                step.type === "shop_name" ||
                                step.type === "shop_domain"
                              ) {
                                return (
                                  <div
                                    key={`shop-info-${stepIndex}`}
                                    className="mt-2"
                                  >
                                    <label className="text-sm font-medium text-gray-700 block mb-1">
                                      {step.type === "shop_name"
                                        ? "Nom de la boutique"
                                        : "Domaine de la boutique"}
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
                              } else if (step.type === "account_type") {
                                const accountType = isVendeur
                                  ? "vendeur"
                                  : "mandataire";
                                const credentials =
                                  paypalCredentials?.[accountType] ?? {};

                                if (isLoadingCredentials) {
                                  return (
                                    <div className="flex items-center justify-center p-4">
                                      <FaSpinner className="animate-spin mr-2" />
                                      Chargement des identifiants...
                                    </div>
                                  );
                                }

                                if (credentialError) {
                                  return (
                                    <p className="text-sm text-red-500 mt-2">
                                      Erreur: {credentialError}
                                    </p>
                                  );
                                }

                                return (
                                  <div
                                    key={`account-${stepIndex}`}
                                    className="mt-4 bg-white p-4 rounded-lg border border-gray-200"
                                  >
                                    <h6 className="font-medium text-gray-800 mb-2">
                                      {step.title}
                                    </h6>
                                    <div className="space-y-2">
                                      <div className="mt-2">
                                        <label className="text-sm font-medium text-gray-700 block mb-1">
                                          Email
                                        </label>
                                        <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                          <span className="flex-1 text-sm text-gray-800 break-all">
                                            {credentials.email ||
                                              "Email non configuré"}
                                          </span>
                                          <button
                                            onClick={() =>
                                              credentials.email &&
                                              navigator.clipboard.writeText(
                                                credentials.email
                                              )
                                            }
                                            className={`text-blue-600 hover:text-blue-800 ml-2 ${!credentials.email ? "opacity-50 cursor-not-allowed" : ""}`}
                                            title={
                                              credentials.email
                                                ? "Copier l'email"
                                                : "Email non configuré"
                                            }
                                          >
                                            <FaCopy />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="mt-2">
                                        <label className="text-sm font-medium text-gray-700 block mb-1">
                                          Mot de passe
                                        </label>
                                        <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                          <span className="flex-1 text-sm text-gray-800 break-all">
                                            {credentials.password
                                              ? showPayPalPassword
                                                ? credentials.password
                                                : "••••••••••••"
                                              : "Mot de passe non configuré"}
                                          </span>
                                          <button
                                            onClick={() =>
                                              setShowPayPalPassword(
                                                !showPayPalPassword
                                              )
                                            }
                                            className={`text-blue-600 hover:text-blue-800 ml-2 ${!credentials.password ? "opacity-50 cursor-not-allowed" : ""}`}
                                            title={
                                              showPayPalPassword
                                                ? "Masquer"
                                                : "Afficher"
                                            }
                                          >
                                            {showPayPalPassword ? (
                                              <FaEyeSlash />
                                            ) : (
                                              <FaEye />
                                            )}
                                          </button>
                                          <button
                                            onClick={() =>
                                              credentials.password &&
                                              navigator.clipboard.writeText(
                                                credentials.password
                                              )
                                            }
                                            className={`text-blue-600 hover:text-blue-800 ml-2 ${!credentials.password ? "opacity-50 cursor-not-allowed" : ""}`}
                                            title={
                                              credentials.password
                                                ? "Copier le mot de passe"
                                                : "Mot de passe non configuré"
                                            }
                                          >
                                            <FaCopy />
                                          </button>
                                        </div>
                                      </div>
                                      {(!credentials.email ||
                                        !credentials.password) && (
                                        <p className="text-xs text-red-500 mt-2">
                                          Les identifiants PayPal ne sont pas
                                          configurés. Veuillez contacter
                                          l'administrateur.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "checkbox_group") {
                                return (
                                  <div
                                    key={`checkbox-group-${stepIndex}`}
                                    className="mt-4 bg-gray-100 p-3 rounded-lg border"
                                  >
                                    {step.items.map((item, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center"
                                      >
                                        <input
                                          type="checkbox"
                                          readOnly
                                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <label className="ml-2 text-sm text-gray-800">
                                          {item}
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                );
                              } else if (step.type === "file_download") {
                                return (
                                  <div
                                    key={`file-download-${stepIndex}`}
                                    className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg"
                                  >
                                    <p
                                      className="text-sm text-gray-700 mb-2"
                                      dangerouslySetInnerHTML={{
                                        __html: step.label,
                                      }}
                                    />
                                    <p className="text-sm text-gray-600">
                                      Sélectionnez :{" "}
                                      <span className="font-semibold text-gray-800">
                                        "{step.select}"
                                      </span>
                                    </p>
                                    <a
                                      href={`/api/internal/files/download/${encodeURIComponent(step.file)}`}
                                      download
                                      className="mt-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                    >
                                      <FaDownload className="mr-2" />
                                      {step.buttonText}
                                    </a>
                                  </div>
                                );
                              } else if (step.type === "iban") {
                                const accountType = isVendeur
                                  ? "vendeur"
                                  : "mandataire";
                                const iban =
                                  paypalCredentials?.[accountType]?.iban;
                                return (
                                  <div
                                    key={`iban-${stepIndex}`}
                                    className="mt-4"
                                  >
                                    <label className="text-sm font-medium text-gray-700 block mb-1">
                                      IBAN (
                                      {isVendeur ? "Vendeur" : "Mandataire"})
                                    </label>
                                    <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                      <span className="flex-1 text-sm text-gray-800 break-all">
                                        {iban || "IBAN non configuré"}
                                      </span>
                                      <button
                                        onClick={() =>
                                          iban &&
                                          navigator.clipboard.writeText(iban)
                                        }
                                        className={`text-blue-600 hover:text-blue-800 ml-2 ${!iban ? "opacity-50 cursor-not-allowed" : ""}`}
                                        title={
                                          iban
                                            ? "Copier l'IBAN"
                                            : "IBAN non configuré"
                                        }
                                      >
                                        <FaCopy />
                                      </button>
                                    </div>
                                    {!iban && (
                                      <p className="text-xs text-red-500 mt-1">
                                        Veuillez configurer l'IBAN dans le
                                        fichier .env du backend.
                                      </p>
                                    )}
                                  </div>
                                );
                              } else if (step.type === "phone_number") {
                                return (
                                  <div
                                    key={`phone-${stepIndex}`}
                                    className="mt-2"
                                  >
                                    <label className="text-sm font-medium text-gray-700 block mb-1">
                                      {step.label}
                                    </label>
                                    <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                      <span className="flex-1 text-sm text-gray-800">
                                        {step.value}
                                      </span>
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "copy_data") {
                                return (
                                  <div
                                    key={`copy-data-${stepIndex}`}
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
                              } else if (step.type === "shop_prefix") {
                                const upperCaseShopName = (
                                  step.value || ""
                                ).toUpperCase();
                                return (
                                  <div
                                    key={`shop-prefix-${stepIndex}`}
                                    className="mt-2"
                                  >
                                    <label className="text-sm font-medium text-gray-700 block mb-1">
                                      {step.label}
                                    </label>
                                    <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                      <span className="text-gray-500 mr-1">
                                        #
                                      </span>
                                      <span className="flex-1 text-sm text-gray-800 font-mono">
                                        {upperCaseShopName}
                                      </span>
                                      <button
                                        onClick={() =>
                                          navigator.clipboard.writeText(
                                            upperCaseShopName
                                          )
                                        }
                                        className="text-blue-600 hover:text-blue-800 ml-2"
                                        title="Copier le nom en majuscules"
                                      >
                                        <FaCopy />
                                      </button>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">
                                      Cliquez sur l'icône de copie pour copier
                                      uniquement le nom en majuscules (sans le
                                      #)
                                    </p>
                                  </div>
                                );
                              } else if (step.type === "env_data") {
                                const envData =
                                  mondialCredentials?.[step.envKey];
                                return (
                                  <div
                                    key={`env-data-${stepIndex}`}
                                    className="mt-2"
                                  >
                                    <label className="text-sm font-medium text-gray-700 block mb-1">
                                      {step.label}
                                    </label>
                                    <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                      <span className="flex-1 text-sm text-gray-800 break-all">
                                        {envData || "Non configuré"}
                                      </span>
                                      <button
                                        onClick={() =>
                                          envData &&
                                          navigator.clipboard.writeText(envData)
                                        }
                                        className={`text-blue-600 hover:text-blue-800 ml-2 ${!envData ? "opacity-50 cursor-not-allowed" : ""}`}
                                        title={
                                          envData
                                            ? "Copier la donnée"
                                            : "Donnée non configurée"
                                        }
                                      >
                                        <FaCopy />
                                      </button>
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "form_section") {
                                return (
                                  <div
                                    key={`form-section-${stepIndex}`}
                                    className="mt-4 bg-white p-4 rounded-lg border border-gray-200"
                                  >
                                    <h6 className="font-medium text-gray-800 mb-2">
                                      {step.title}
                                    </h6>
                                    <div className="space-y-2">
                                      {step.fields.map((field, fieldIndex) => (
                                        <div
                                          key={`field-${fieldIndex}`}
                                          className="flex items-center"
                                        >
                                          <label className="text-sm font-medium text-gray-700 mr-2">
                                            {field.label}:
                                          </label>
                                          <div className="flex-1">
                                            {field.type === "copy_data" ? (
                                              <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                                <span className="flex-1 text-sm text-gray-800 break-all">
                                                  {field.value}
                                                </span>
                                                <button
                                                  onClick={() =>
                                                    field.value &&
                                                    navigator.clipboard.writeText(
                                                      field.value
                                                    )
                                                  }
                                                  className="text-blue-600 hover:text-blue-800 ml-2"
                                                  title="Copier"
                                                >
                                                  <FaCopy />
                                                </button>
                                              </div>
                                            ) : field.type === "env_data" ? (
                                              <div className="flex items-center border rounded-md px-3 py-2 bg-gray-100">
                                                <span className="flex-1 text-sm text-gray-800 break-all">
                                                  {mondialCredentials?.[
                                                    field.envKey
                                                  ] || "Non configuré"}
                                                </span>
                                                <button
                                                  onClick={() =>
                                                    mondialCredentials?.[
                                                      field.envKey
                                                    ] &&
                                                    navigator.clipboard.writeText(
                                                      mondialCredentials[
                                                        field.envKey
                                                      ]
                                                    )
                                                  }
                                                  className={`text-blue-600 hover:text-blue-800 ml-2 ${!mondialCredentials?.[field.envKey] ? "opacity-50 cursor-not-allowed" : ""}`}
                                                  title={
                                                    mondialCredentials?.[
                                                      field.envKey
                                                    ]
                                                      ? "Copier la donnée"
                                                      : "Donnée non configurée"
                                                  }
                                                >
                                                  <FaCopy />
                                                </button>
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "image") {
                                return (
                                  <div
                                    key={`image-${stepIndex}`}
                                    className="mt-4"
                                  >
                                    <img
                                      src={step.src}
                                      alt={step.alt}
                                      className="w-12 h-12 object-contain rounded-md"
                                    />
                                  </div>
                                );
                              } else if (step.type === "notice") {
                                const noticeStyles = {
                                  warning:
                                    "bg-yellow-50 border-yellow-300 text-yellow-800",
                                  critical:
                                    "bg-red-100 border-red-400 text-red-900",
                                };
                                return (
                                  <div
                                    key={`notice-${stepIndex}`}
                                    className={`mt-4 p-3 border rounded-lg ${noticeStyles[step.level] || noticeStyles.warning}`}
                                  >
                                    <div className="flex items-center">
                                      <FaExclamationCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                                      <p className="font-bold text-sm ml-2">
                                        {step.text}
                                      </p>
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "api_scopes") {
                                return (
                                  <div
                                    key={`api-scopes-${stepIndex}`}
                                    className="mt-4 p-4 bg-gray-50 border rounded-lg"
                                  >
                                    <h6 className="font-medium text-gray-800 mb-2">
                                      Autorisations requises :
                                    </h6>
                                    <div className="space-y-2">
                                      {step.scopes.map((scope) => (
                                        <div
                                          key={scope.id}
                                          className="flex items-start"
                                        >
                                          <input
                                            type="checkbox"
                                            id={`checkbox-${scope.id}`}
                                            checked={
                                              checkedPermissions[scope.id]
                                            }
                                            onChange={(e) =>
                                              handlePermissionChange(
                                                scope.id,
                                                e.target.checked
                                              )
                                            }
                                            className="h-4 w-4 mt-1 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                                          />
                                          <div className="ml-3 text-sm">
                                            <label
                                              htmlFor={`checkbox-${scope.id}`}
                                              className="font-mono bg-gray-200 px-1 rounded cursor-pointer"
                                            >
                                              {scope.label}
                                            </label>
                                            <p className="text-gray-600">
                                              {scope.description}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "api_credentials_form") {
                                return (
                                  <div
                                    key={`api-creds-form-${stepIndex}`}
                                    className="mt-4 p-4 bg-white border rounded-lg space-y-4"
                                  >
                                    <div>
                                      <label
                                        htmlFor="accessToken"
                                        className="block text-sm font-medium text-gray-700"
                                      >
                                        Jeton d'accès à l'API Admin
                                      </label>
                                      <p className="text-xs text-gray-500 mb-1">
                                        Cliquez sur `Révéler le jeton une seule
                                        fois`, puis copiez la valeur ici.
                                      </p>
                                      <input
                                        type="text"
                                        id="accessToken"
                                        value={accessToken}
                                        onChange={(e) =>
                                          setAccessToken(e.target.value)
                                        }
                                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label
                                        htmlFor="apiKey"
                                        className="block text-sm font-medium text-gray-700"
                                      >
                                        Clé API
                                      </label>
                                      <p className="text-xs text-gray-500 mb-1">
                                        Faites défiler vers le bas et copiez la
                                        `Clé API` ici.
                                      </p>
                                      <input
                                        type="text"
                                        id="apiKey"
                                        value={apiKey}
                                        onChange={(e) =>
                                          setApiKey(e.target.value)
                                        }
                                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label
                                        htmlFor="apiSecret"
                                        className="block text-sm font-medium text-gray-700"
                                      >
                                        Clé secrète de l'API
                                      </label>
                                      <p className="text-xs text-gray-500 mb-1">
                                        Copiez la `Clé secrète de l'API` ici.
                                      </p>
                                      <input
                                        type="text"
                                        id="apiSecret"
                                        value={apiSecret}
                                        onChange={(e) =>
                                          setApiSecret(e.target.value)
                                        }
                                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label
                                        htmlFor="adminUrl"
                                        className="block text-sm font-medium text-gray-700"
                                      >
                                        URL d'administration de la boutique
                                      </label>
                                      <p className="text-xs text-gray-500 mb-1">
                                        Copiez l'URL de votre tableau de bord
                                        admin (ex:
                                        https://votre-boutique.myshopify.com/admin)
                                      </p>
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
                                        onClick={handleSaveApiKeys}
                                        disabled={
                                          isSavingKeys || saveKeysSuccess
                                        }
                                        className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${saveKeysSuccess ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50`}
                                      >
                                        {isSavingKeys && (
                                          <FaSpinner className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                                        )}
                                        {saveKeysSuccess
                                          ? "Clés enregistrées avec succès !"
                                          : "Valider les clés API"}
                                      </button>
                                      {saveKeysError && (
                                        <p className="mt-2 text-sm text-red-600">
                                          {saveKeysError}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              } else if (step.type === "final_step_content") {
                                // Recalculate hasMondialRelay to determine the correct step ID
                                const totalSteps = steps.length;
                                return (
                                  <div
                                    key={`final-step-${stepIndex}`}
                                    className="mt-4 p-4 bg-white border rounded-lg space-y-4"
                                  >
                                    {step.isVendeur ? (
                                      <div>
                                        <h6 className="font-medium text-gray-800 mb-2">
                                          Pour les Vendeurs (Génération
                                          Automatisée)
                                        </h6>
                                        <p className="text-sm text-gray-600 mb-4">
                                          En cliquant sur le bouton ci-dessous,
                                          le système générera automatiquement
                                          les documents légaux (CGV, Mentions
                                          Légales, Politiques) et appliquera les
                                          éléments graphiques (bannières, logos)
                                          au thème de la boutique.
                                        </p>
                                      </div>
                                    ) : (
                                      <div>
                                        <h6 className="font-medium text-gray-800 mb-2">
                                          Pour les Mandataires (Action Manuelle
                                          Requise)
                                        </h6>
                                        <p className="text-sm text-gray-600 mb-2">
                                          Les documents tels que les CGV,
                                          Mentions Légales et Politiques de
                                          confidentialité doivent être fournis
                                          par le client. Notre automatisation ne
                                          peut donc pas les générer.
                                        </p>
                                        <p className="text-sm text-gray-600 mb-4">
                                          Cependant, le bouton ci-dessous
                                          appliquera tous les éléments
                                          graphiques nécessaires comme les
                                          bannières et les logos au thème.
                                        </p>
                                      </div>
                                    )}
                                    <div className="pt-2">
                                      <button
                                        onClick={handleThemeConfiguration}
                                        disabled={isFinalizing}
                                        className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isFinalizing ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                                      >
                                        {isFinalizing && (
                                          <FaSpinner className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                                        )}
                                        {isFinalizing
                                          ? "Configuration en cours..."
                                          : "Générer et Appliquer la Configuration"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </ol>
                        </div>
                      );
                    }
                    return null;
                  })}
                </ol>
              </div>
            </div>

            {/* Navigation Buttons */}
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
                      disabled={isFinalizing}
                      className={`flex-1 py-2 px-4 rounded-md text-sm font-medium flex items-center justify-center space-x-2 ${isFinalizing ? "bg-gray-400 text-white" : "bg-green-600 text-white hover:bg-green-700"} transition-colors`}
                    >
                      {isFinalizing && (
                        <FaSpinner className="animate-spin -ml-1 mr-3 h-4 w-4" />
                      )}
                      <span>
                        {isFinalizing ? "Finalisation..." : "Finaliser"}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Information / Fallback */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50">
            {isFullyCompleted ? (
              <div className="text-center max-w-md space-y-4">
                <FaCheckCircle className="text-green-500 mx-auto" size={48} />
                <h4 className="text-xl font-semibold text-green-800">
                  Paramétrage Terminé !
                </h4>
                <p className="text-sm text-gray-700">
                  Toutes les étapes de configuration pour la boutique{" "}
                  <strong>{shop?.name}</strong> ont été complétées. Vous pouvez
                  maintenant fermer cet assistant.
                </p>
                <button
                  onClick={handleCloseWithUpdate}
                  className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Fermer l'assistant
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
                  Page Shopify ouverte dans un nouvel onglet
                </h4>
                <p className="text-sm text-gray-700">
                  Nous avons automatiquement ouvert la page de connexion Shopify
                  (recherche de boutique) dans un nouvel onglet. Utilisez-la
                  pour suivre les instructions de cette fenêtre.
                </p>
                <p className="text-sm text-gray-700">
                  Cliquez sur le bouton ci-dessous pour ouvrir la page de
                  connexion Shopify, puis votre interface d'administration dans
                  de nouveaux onglets.
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

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Progression:</span>{" "}
            {completedSteps.size}/{steps.length} étapes terminées
          </div>
        </div>
      </div>

      {/* Credentials Modal */}
      {modal.open && (
        <NotificationModal
          open={modal.open}
          title={modal.title}
          message={modal.message}
          type={modal.type}
          onClose={modal.onClose}
          onConfirm={modal.onConfirm}
          confirmText={modal.confirmText}
          cancelText={modal.cancelText}
        />
      )}
    </div>
  );
};

export default ParametrizationWizardModal;
