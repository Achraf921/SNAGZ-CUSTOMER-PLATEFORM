import React, { useState, useEffect, useRef } from "react";
import { FaShopify, FaCheck, FaSpinner } from "react-icons/fa";
import NotificationModal from "../../shared/NotificationModal";

const ShopifyConfiguration = () => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatingFor, setGeneratingFor] = useState(null);
  const [captchaData, setCaptchaData] = useState(null);
  const [iframeKey, setIframeKey] = useState(0); // For forcing iframe refresh
  const [modal, setModal] = useState({ open: false });
  const [otp, setOtp] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const otpRef = useRef("");

  // Max waiting time for generation (ms)
  const GENERATION_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  // Listen for iframe messages only (remove auto-refresh)
  useEffect(() => {
    if (!captchaData) return;

    const handleMessage = (event) => {
      if (event.data && event.data.type === "form_submitted") {
        console.log("Form submitted in iframe, refreshing content...");
        // Refresh iframe content after form submission
        setTimeout(() => {
          setIframeKey((prev) => prev + 1);
        }, 1000);
      } else if (event.data && event.data.type === "captcha_completed") {
        console.log("CAPTCHA completed, refreshing content...");
        setTimeout(() => {
          setIframeKey((prev) => prev + 1);
        }, 500);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [captchaData]);

  // Persistent generation status (localStorage key)
  useEffect(() => {
    const storedGen = localStorage.getItem("shopifyGeneratingFor");
    if (storedGen) {
      // Validate that the job is actually running on the backend
      fetch(`/api/shopify/status/${storedGen}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.running) {
            setGeneratingFor(storedGen);
          } else {
            // Job is not running, clear stored state
            localStorage.removeItem("shopifyGeneratingFor");
            localStorage.removeItem("shopifyGenStart");
            localStorage.removeItem("shopify2FASession");
          }
        })
        .catch((err) => {
          console.error("Failed to check status:", err);
          // On error, clear stored state to be safe
          localStorage.removeItem("shopifyGeneratingFor");
          localStorage.removeItem("shopifyGenStart");
          localStorage.removeItem("shopify2FASession");
        });
    }

    // Restore pending 2FA session if exists
    const stored2FA = localStorage.getItem("shopify2FASession");
    if (stored2FA) {
      prompt2FACode(stored2FA);
    }
  }, []);

  // Whenever shops change, reconcile persistent generating state
  useEffect(() => {
    if (!generatingFor) return;
    const genShop = shops.find((s) => s._id === generatingFor);
    if (genShop && genShop.hasShopify) {
      setGeneratingFor(null);
      localStorage.removeItem("shopifyGeneratingFor");
      localStorage.removeItem("shopify2FASession");
    }
  }, [shops, generatingFor]);

  // Set up periodic watchdog when loading is active
  useEffect(() => {
    if (!generatingFor) return;

    const timer = setInterval(() => {
      const startTs = parseInt(
        localStorage.getItem("shopifyGenStart") || "0",
        10
      );
      if (startTs && Date.now() - startTs > GENERATION_TIMEOUT) {
        // Timeout reached – stop loading
        setGeneratingFor(null);
        localStorage.removeItem("shopifyGeneratingFor");
        localStorage.removeItem("shopifyGenStart");
        localStorage.removeItem("shopify2FASession");
        setModal({
          open: true,
          type: "error",
          title: "Temps écoulé",
          message:
            "La tentative de connexion à Shopify a expiré. Veuillez réessayer.",
          onClose: () => setModal({ open: false }),
        });
      }
    }, 30_000); // check every 30 s

    return () => clearInterval(timer);
  }, [generatingFor]);

  const fetchShops = async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/customer/all?details=true", {
        headers: {
          "Cache-Control": "no-cache",
        },
        credentials: "include",
      });

      if (!response.ok)
        throw new Error("Erreur lors de la récupération des boutiques");

      const data = await response.json();

      // Transforme la structure pour obtenir une liste plate de boutiques
      const processedShops = (data.customers || []).reduce((acc, customer) => {
        if (customer.status === "active" && Array.isArray(customer.shops)) {
          const mapped = customer.shops.map((shop) => ({
            _id: shop.shopId || shop._id || shop.id,
            name: shop.nomProjet || shop.shopName || shop.name || "-",
            clientName: customer.raisonSociale || customer.name,
            clientId: customer._id?.toString() || customer.id,
            isValidated: shop.status === "valid",
            isDocumented:
              shop.documented === "documented" || shop.documented === true,
            hasShopify:
              shop.hasShopify === true || shop.shopifyConfigured === true,
            isParametrized: shop.shopifyParametrized === true,
            parametrizationError: shop.shopifyParametrizationError,
            shopifyDomain: shop.shopifyDomain,
            raw: shop,
          }));
          return [...acc, ...mapped];
        }
        return acc;
      }, []);

      setShops(processedShops);
      setError(null);
      return processedShops;
    } catch (err) {
      console.error("Erreur:", err);
      setError("Une erreur est survenue lors du chargement des boutiques.");
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  const askConfirmation = (shopId) => {
    setModal({
      open: true,
      type: "confirmation",
      title: "Confirmation",
      message: "Êtes-vous sûr de vouloir générer la boutique Shopify ?",
      onClose: () => setModal({ open: false }),
      onConfirm: () => {
        setModal({ open: false });
        generateShop(shopId);
      },
    });
  };

  const generateShop = async (shopId) => {
    setGeneratingFor(shopId);
    localStorage.setItem("shopifyGenStart", Date.now().toString());
    localStorage.setItem("shopifyGeneratingFor", shopId);
    console.log(
      "[ShopifyConfig] Lancement de la génération du store pour",
      shopId
    );
    let hasCaptcha = false;
    try {
      const response = await fetch(`/api/shopify/generate/${shopId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      console.log("[ShopifyConfig] Response status:", response.status);

      if (response.status === 203) {
        // CAPTCHA required
        console.log("[ShopifyConfig] CAPTCHA detected - handling CAPTCHA flow");
        const data = await response.json();
        console.log("[ShopifyConfig] CAPTCHA data:", data);
        const { sessionId, captchaUrl, message } = data;
        setCaptchaData({ sessionId, captchaUrl });
        setIframeKey(0); // Reset iframe key when CAPTCHA opens
        hasCaptcha = true;
        console.log(
          "[ShopifyConfig] CAPTCHA data set - iframe modal will show"
        );
        // Don't show notification modal, only the CAPTCHA iframe modal
        console.log("[ShopifyConfig] Returning early from CAPTCHA flow");
        return;
      }

      if (response.status === 202) {
        console.log("[ShopifyConfig] 2FA required");
        const data = await response.json();
        const { sessionId } = data;
        prompt2FACode(sessionId);
        localStorage.setItem("shopify2FASession", sessionId);
        return;
      }

      if (!response.ok) {
        console.log("[ShopifyConfig] Response not OK:", response.status);
        throw new Error("Erreur lors de la génération");
      }

      // Normal success flow
      console.log("[ShopifyConfig] Normal success flow");
      const updatedList = await fetchShops();
      const newShop = updatedList.find((s) => s._id === shopId);
      if (newShop) promptApiKeys(newShop);
      console.log("[ShopifyConfig] Génération terminée pour", shopId);
      setModal({
        open: true,
        type: "success",
        title: "Boutique générée",
        message: "La boutique Shopify a été créée avec succès.",
        onClose: () => setModal({ open: false }),
      });
      localStorage.removeItem("shopifyGeneratingFor");
      localStorage.removeItem("shopify2FASession");
      localStorage.removeItem("shopifyGenStart");
    } catch (err) {
      console.error("Erreur:", err);
      setModal({
        open: true,
        type: "error",
        title: "Erreur",
        message: "Une erreur est survenue lors de la génération.",
        onClose: () => setModal({ open: false }),
      });
    } finally {
      console.log("[ShopifyConfig] Finally block - hasCaptcha:", hasCaptcha);
      if (!hasCaptcha) {
        console.log("[ShopifyConfig] Setting generatingFor to null");
        setGeneratingFor(null);
        localStorage.removeItem("shopifyGeneratingFor");
      } else {
        console.log(
          "[ShopifyConfig] NOT setting generatingFor to null due to CAPTCHA"
        );
      }
    }
  };

  const continueCaptcha = async () => {
    if (!captchaData?.sessionId) return;

    try {
      const response = await fetch(
        `/api/shopify/captcha/${captchaData.sessionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.status === 202) {
        // 2FA required after CAPTCHA
        const data = await response.json();
        setCaptchaData(null);
        setModal({ open: false });
        prompt2FACode(data.sessionId);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || "Erreur lors de la continuation après CAPTCHA"
        );
      }

      // Success
      setCaptchaData(null);
      setModal({ open: false });
      await fetchShops();
      setModal({
        open: true,
        type: "success",
        title: "Boutique générée",
        message:
          "La boutique Shopify a été créée avec succès après résolution du CAPTCHA.",
        onClose: () => setModal({ open: false }),
      });
    } catch (err) {
      console.error("Erreur:", err);
      setModal({
        open: true,
        type: "error",
        title: "Erreur",
        message:
          err.message || "Une erreur est survenue lors de la continuation.",
        onClose: () => {
          setModal({ open: false });
          setCaptchaData(null);
        },
      });
    } finally {
      setGeneratingFor(null);
      localStorage.removeItem("shopifyGeneratingFor");
      localStorage.removeItem("shopifyGenStart");
    }
  };

  const handleGenerateShopify = (shopId) => {
    askConfirmation(shopId);
  };

  const handleMarkAlreadyConfigured = async (shop) => {
    console.log("[ShopifyConfig] Marquage hasShopify=true pour", shop._id);
    try {
      const response = await fetch(
        `/api/internal/clients/${shop.clientId}/shops/${shop._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ hasShopify: true }),
        }
      );
      if (!response.ok) throw new Error("Erreur lors de la mise à jour");
      await fetchShops();
      console.log("[ShopifyConfig] Marquage terminé pour", shop._id);
    } catch (err) {
      console.error("Erreur:", err);
      setError(
        "Impossible de mettre à jour le statut Shopify pour cette boutique."
      );
    }
  };

  const handleMarkNotConfigured = async (shop) => {
    console.log("[ShopifyConfig] Marquage hasShopify=false pour", shop._id);
    try {
      const response = await fetch(
        `/api/internal/clients/${shop.clientId}/shops/${shop._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ hasShopify: false }),
        }
      );
      if (!response.ok) throw new Error("Erreur lors de la mise à jour");
      await fetchShops();
      console.log("[ShopifyConfig] Marquage terminé pour", shop._id);
    } catch (err) {
      console.error("Erreur:", err);
      setError(
        "Impossible de mettre à jour le statut Shopify pour cette boutique."
      );
    }
  };

  const handleParametrizeShop = async (shop) => {
    console.log("[ShopifyConfig] Démarrage paramétrage pour", shop._id);

    // First, prompt for access token
    setModal({
      open: true,
      type: "confirmation",
      title: "🔧 Configuration de la boutique",
      message: (
        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <h4 className="font-semibold text-blue-800 mb-2">
              Access Token requis
            </h4>
            <p className="text-blue-700 text-sm mb-3">
              Pour configurer automatiquement votre boutique Shopify, nous avons
              besoin d'un access token.
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded border">
            <h5 className="font-medium mb-2">📝 Instructions :</h5>
            <ol className="text-sm space-y-1 list-decimal list-inside text-gray-700">
              <li>
                Allez dans votre Shopify Admin {">"} Settings {">"} Apps and
                sales channels
              </li>
              <li>Cliquez sur "Develop apps"</li>
              <li>Créez une nouvelle app privée</li>
              <li>
                Activez les scopes:{" "}
                <code className="bg-gray-200 px-1 rounded">
                  read_shop_information
                </code>{" "}
                et{" "}
                <code className="bg-gray-200 px-1 rounded">
                  write_shop_information
                </code>
              </li>
              <li>Copiez l'access token généré</li>
            </ol>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Access Token :
            </label>
            <input
              type="text"
              id="access-token-input"
              name="new-password-ignore-autofill"
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              data-form-type="other"
              className="w-full border rounded p-2 text-sm font-mono"
              placeholder="shpat_..."
              defaultValue=""
              onFocus={(e) => {
                e.target.value = "";
                e.target.select();
              }}
              onPaste={(e) => {
                // Allow pasting but clear any autofill first
                setTimeout(() => {
                  const value = e.target.value.trim();
                  if (!value.startsWith("shpat_")) {
                    e.target.value = "";
                  }
                }, 10);
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              ⚠️ Si du texte apparaît automatiquement, supprimez-le et collez
              votre token
            </p>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
            <p className="text-yellow-700 text-xs">
              <strong>Note :</strong> Les paramètres de facturation et de
              préfixe de commande ne peuvent pas être configurés automatiquement
              via l'API GraphQL. Des instructions manuelles vous seront
              fournies.
            </p>
          </div>
        </div>
      ),
      onClose: () => setModal({ open: false }),
      onConfirm: async () => {
        const accessToken = document
          .getElementById("access-token-input")
          ?.value?.trim();
        console.log(
          "🔧 Frontend - Access token captured:",
          accessToken?.substring(0, 20) + "..."
        );

        if (!accessToken) {
          alert("Veuillez entrer un access token");
          return;
        }

        if (!accessToken.startsWith("shpat_")) {
          alert(
            `❌ Access token invalide!\n\nReçu: "${accessToken.substring(0, 30)}..."\n\nL'access token Shopify doit commencer par 'shpat_'\n\n💡 Tip: Supprimez tout texte auto-rempli et collez votre vrai token`
          );
          return;
        }

        if (accessToken.length < 20) {
          alert(
            "L'access token semble trop court. Vérifiez que vous avez copié le token complet."
          );
          return;
        }

        setModal({ open: false });
        await performParametrization(shop, accessToken);
      },
      cancelText: "❌ Annuler",
      confirmText: "🔧 Configurer",
    });
  };

  const performParametrization = async (shop, accessToken) => {
    try {
      const response = await fetch(`/api/shopify/parametrize/${shop._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ accessToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erreur lors du paramétrage");
      }

      const result = await response.json();

      if (result.result?.requiresManualSetup) {
        // Show manual setup instructions
        setModal({
          open: true,
          type: "info",
          title: "📋 Configuration manuelle requise",
          message: (
            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                <p className="text-blue-700 text-sm">
                  La configuration automatique n'est pas possible. Veuillez
                  configurer manuellement les paramètres suivants dans votre
                  Shopify Admin :
                </p>
              </div>

              {result.result.manualSteps?.map((step, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded border">
                  <h5 className="font-medium text-gray-800 mb-2">
                    {index + 1}. {step.title}
                  </h5>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Chemin :</strong> {step.path}
                  </p>
                  {step.fields ? (
                    <div className="space-y-1">
                      {Object.entries(step.fields).map(([field, value]) => (
                        <div key={field} className="text-sm">
                          <strong>{field} :</strong>{" "}
                          <code className="bg-gray-200 px-1 rounded">
                            {value}
                          </code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm">
                      <strong>{step.field} :</strong>{" "}
                      <code className="bg-gray-200 px-1 rounded">
                        {step.value}
                      </code>
                    </div>
                  )}
                </div>
              ))}

              <div className="bg-green-50 border-l-4 border-green-400 p-3 rounded">
                <p className="text-green-700 text-sm">
                  <strong>Lien direct :</strong>{" "}
                  <a
                    href={result.result.shopUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 underline hover:text-green-800"
                  >
                    Ouvrir Shopify Admin
                  </a>
                </p>
              </div>
            </div>
          ),
          onClose: () => setModal({ open: false }),
          confirmText: "✅ J'ai compris",
        });
      } else {
        // Show success
        setModal({
          open: true,
          type: "success",
          title: "✅ Configuration réussie",
          message:
            result.message || "La boutique a été configurée avec succès.",
          onClose: () => setModal({ open: false }),
        });
      }

      // Refresh the shops list
      setTimeout(() => {
        fetchShops();
      }, 2000);
    } catch (err) {
      console.error("Erreur paramétrage:", err);
      setModal({
        open: true,
        type: "error",
        title: "❌ Erreur de configuration",
        message: (
          <div className="space-y-3">
            <p>
              {err.message ||
                "Une erreur est survenue lors de la configuration."}
            </p>
            {err.message?.includes("Access token") && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                <p className="text-yellow-700 text-sm">
                  <strong>Vérifiez :</strong> Votre access token et les scopes
                  de votre app privée Shopify.
                </p>
              </div>
            )}
          </div>
        ),
        onClose: () => setModal({ open: false }),
      });
    }
  };

  const cancel2FAProcess = async (sessionId) => {
    try {
      // Call backend to cancel the process and close browser
      await fetch(`/api/shopify/cancel/${sessionId}`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Error canceling process:", err);
    } finally {
      // Reset all states
      setModal({ open: false });
      setOtp("");
      setCurrentSessionId(null);
      setGeneratingFor(null);
      setIsOpeningStore(false);
    }
  };

  const prompt2FACode = (sessionId) => {
    setCurrentSessionId(sessionId);
    setOtp("");
    setModal({
      open: true,
      type: "confirmation",
      title: "Code d'authentification",
      message: (
        <div>
          <p>
            Veuillez entrer le code à 6 chiffres généré par votre application
            d'authentification.
          </p>
          <input
            type="text"
            maxLength="6"
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              otpRef.current = val;
              setOtp(val);
              // Pas d'auto-submit ; l'utilisateur clique sur Confirmer
            }}
            className="mt-4 w-full border rounded p-2 text-center tracking-widest"
            placeholder="123456"
          />
        </div>
      ),
      onClose: () => cancel2FAProcess(sessionId),
      onConfirm: () => submit2FACode(sessionId, otpRef.current),
      cancelText: "❌ Annuler et fermer le navigateur",
      confirmText: "✅ Valider",
    });
  };

  const submit2FACode = async (sessionIdParam, codeValue) => {
    try {
      // Close the 2FA modal and show loading screen with "opening store" message
      setModal({ open: false });
      setIsOpeningStore(true);
      setGeneratingFor(sessionIdParam); // Show the loading overlay

      const response = await fetch(`/api/shopify/2fa/${sessionIdParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeValue }),
      });

      if (response.status === 203) {
        // CAPTCHA required after 2FA
        console.log("[2FA] CAPTCHA required after 2FA code submission");
        const data = await response.json();
        const { sessionId, captchaUrl, message } = data;
        setCaptchaData({ sessionId, captchaUrl });
        setModal({ open: false });
        setIsOpeningStore(false);
        console.log("[2FA] CAPTCHA modal will show for post-2FA verification");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        // Stop loading overlay
        setGeneratingFor(null);
        setIsOpeningStore(false);

        console.log("[2FA] Response error:", response.status, data);

        // Show error in the 2FA modal and keep it open for retry
        setModal({
          open: true,
          type: "confirmation",
          title: "❌ Code d'authentification incorrect",
          message: (
            <div>
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 rounded">
                <p className="text-red-700 text-sm">
                  <strong>Code incorrect!</strong> Veuillez vérifier votre
                  application d'authentification et entrer le bon code.
                </p>
              </div>
              <p className="mb-4">
                Veuillez entrer le code à 6 chiffres généré par votre
                application d'authentification.
              </p>
              <input
                type="text"
                maxLength="6"
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  otpRef.current = val;
                  setOtp(val);
                }}
                className="mt-4 w-full border rounded p-2 text-center tracking-widest"
                placeholder="123456"
                autoFocus
              />
            </div>
          ),
          onClose: () => cancel2FAProcess(sessionIdParam),
          onConfirm: () => submit2FACode(sessionIdParam, otpRef.current),
          cancelText: "❌ Annuler et fermer le navigateur",
          confirmText: "✅ Valider",
        });
        return;
      }

      await fetchShops();
      setModal({
        open: true,
        type: "success",
        title: "🎉 Boutique créée avec succès !",
        message:
          "Félicitations ! Votre boutique Shopify a été créée et configurée automatiquement. Elle est maintenant prête à être utilisée.",
        onClose: () => setModal({ open: false }),
      });
      localStorage.removeItem("shopifyGeneratingFor");
      localStorage.removeItem("shopify2FASession");
      localStorage.removeItem("shopifyGenStart");
    } catch (err) {
      console.error(err);

      // Stop loading overlay
      setGeneratingFor(null);
      setIsOpeningStore(false);

      setModal({
        open: true,
        type: "confirmation",
        title: "❌ Erreur de validation",
        message: (
          <div>
            <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 rounded">
              <p className="text-red-700 text-sm">
                <strong>Erreur!</strong>{" "}
                {err.message ||
                  "Une erreur est survenue lors de la validation du code."}
              </p>
            </div>
            <p className="mb-4">
              Veuillez entrer le code à 6 chiffres généré par votre application
              d'authentification.
            </p>
            <input
              type="text"
              maxLength="6"
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                otpRef.current = val;
                setOtp(val);
              }}
              className="mt-4 w-full border rounded p-2 text-center tracking-widest"
              placeholder="123456"
              autoFocus
            />
          </div>
        ),
        onClose: () => cancel2FAProcess(sessionIdParam),
        onConfirm: () => submit2FACode(sessionIdParam, otpRef.current),
        cancelText: "❌ Annuler et fermer le navigateur",
        confirmText: "✅ Valider",
      });
    } finally {
      setOtp("");
    }
  };

  const promptApiKeys = (shop) => {
    setModal({
      open: true,
      type: "confirmation",
      title: "🔑 Ajouter les clés API",
      message: (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Pour pouvoir communiquer avec Shopify, vous devez créer une{" "}
            <strong>application personnalisée</strong> (Custom App) dans votre
            nouvelle boutique puis copier
            <br /> <code className="bg-gray-100 px-1">API key</code> &{" "}
            <code className="bg-gray-100 px-1">API secret key</code> ci-dessous.
          </p>

          <details className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <summary className="cursor-pointer font-medium text-blue-800">
              Tutoriel – créer l'app dans Shopify
            </summary>
            <ol className="list-decimal ml-6 mt-3 space-y-1 text-sm text-blue-700">
              <li>
                Ouvrez l'Admin de la boutique&nbsp;:{" "}
                <a
                  href={`https://${shop.shopifyDomain}.myshopify.com/admin`}
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shop.shopifyDomain}.myshopify.com/admin
                </a>
              </li>
              <li>
                Menu <strong>Apps → Develop apps</strong>
              </li>
              <li>
                Cliquez <strong>Create an app</strong> ; donnez-lui par ex. le
                nom « SNA-Connector »
              </li>
              <li>
                Onglet <strong>Configuration</strong> →{" "}
                <strong>Admin API integration</strong>
              </li>
              <li>
                Activez <em>toutes</em> les autorisations disponibles (ou au
                minimum « Products » en lecture/écriture) puis{" "}
                <strong>Save</strong>
              </li>
              <li>
                Retournez à l'onglet <strong>API credentials</strong> → Cliquez{" "}
                <strong>Install app</strong> puis confirmez
              </li>
              <li>
                Copiez les champs{" "}
                <code className="bg-gray-100 px-1">API key</code> et{" "}
                <code className="bg-gray-100 px-1">API secret key</code>
              </li>
            </ol>
          </details>

          <div className="space-y-2">
            <label className="block text-sm font-medium">API key :</label>
            <input
              id="shop-api-key"
              type="text"
              className="w-full border rounded p-2"
              placeholder="ex: 3d2f0d6a0e..."
            />

            <label className="block text-sm font-medium mt-3">
              API secret key :
            </label>
            <input
              id="shop-api-secret"
              type="text"
              className="w-full border rounded p-2"
              placeholder="ex: shpss_..."
            />
          </div>
        </div>
      ),
      onClose: () => setModal({ open: false }),
      onConfirm: async () => {
        const apiKey = document.getElementById("shop-api-key")?.value.trim();
        const apiSecret = document
          .getElementById("shop-api-secret")
          ?.value.trim();
        if (!apiKey || !apiSecret)
          return alert("Veuillez remplir les deux champs");

        try {
          const res = await fetch(
            `/api/internal/clients/${shop.clientId}/shops/${shop._id}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                "shopifyConfig.apiKey": apiKey,
                "shopifyConfig.apiSecret": apiSecret,
              }),
            }
          );
          if (!res.ok) throw new Error("Échec de la sauvegarde");
          await fetchShops();
          setModal({ open: false });
        } catch (e) {
          alert(e.message);
        }
      },
      confirmText: "💾 Enregistrer",
      cancelText: "Annuler",
    });
  };

  return (
    <div className="space-y-6 p-6 relative">
      {generatingFor && !captchaData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 z-40">
          <FaSpinner className="animate-spin h-8 w-8 text-sna-primary mb-4" />
          <p className="text-sna-primary">
            {isOpeningStore
              ? "Ouverture de la boutique…"
              : "Connexion à Shopify…"}
          </p>
        </div>
      )}

      {/* CAPTCHA Modal */}
      {captchaData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  🤖 CAPTCHA - Vérification humaine requise
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Résolvez le CAPTCHA ci-dessous pour continuer.
                </p>
              </div>
              <button
                onClick={() => {
                  setCaptchaData(null);
                  setGeneratingFor(null);
                  setIsOpeningStore(false);
                }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 p-4">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4">
                <p className="text-sm text-blue-700">
                  <strong>Instructions :</strong> Cliquez sur "Activer hCaptcha"
                  pour déclencher le défi, puis résolvez-le directement dans
                  l'aperçu ci-dessous.
                </p>
              </div>

              <div className="flex justify-center mb-6">
                <button
                  onClick={async () => {
                    try {
                      // Click the CAPTCHA checkbox using Puppeteer
                      const response = await fetch(
                        `/api/shopify/click-captcha/${captchaData.sessionId}`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        }
                      );

                      if (response.ok) {
                        const result = await response.json();
                        console.log("CAPTCHA click result:", result);

                        // Refresh the iframe to show the modal
                        setIframeKey((prev) => prev + 1);

                        // Show success notification
                        setModal({
                          open: true,
                          type: "success",
                          title: "hCaptcha activé",
                          message:
                            "Le défi hCaptcha a été activé. Vous pouvez maintenant le résoudre dans l'aperçu ci-dessous.",
                          onClose: () => setModal({ open: false }),
                        });
                      } else {
                        throw new Error("Échec de l'activation du CAPTCHA");
                      }
                    } catch (err) {
                      console.error("CAPTCHA click failed:", err);
                      setModal({
                        open: true,
                        type: "error",
                        title: "Erreur d'activation",
                        message:
                          "Impossible d'activer le hCaptcha. Essayez le bouton 'Actualiser' puis réessayez.",
                        onClose: () => setModal({ open: false }),
                      });
                    }
                  }}
                  className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium mr-4"
                >
                  🎯 Activer hCaptcha
                </button>

                <button
                  onClick={() => {
                    const popup = window.open(
                      `/api/shopify/live/${captchaData.sessionId}?popup=true`,
                      "hcaptcha-popup",
                      "width=900,height=700,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=yes,status=no"
                    );

                    // Focus the popup window
                    if (popup) {
                      popup.focus();

                      // Monitor popup for closure
                      const checkClosed = setInterval(() => {
                        if (popup.closed) {
                          clearInterval(checkClosed);
                          // Refresh the preview after popup closes
                          setIframeKey((prev) => prev + 1);
                        }
                      }, 1000);
                    }
                  }}
                  className="inline-flex items-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium mr-4"
                >
                  🪟 Ouvrir dans une fenêtre
                </button>

                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        `/api/shopify/force-refresh/${captchaData.sessionId}`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        }
                      );

                      if (response.ok) {
                        const result = await response.json();
                        console.log("Force refresh result:", result);

                        // Refresh the iframe to show the updated page
                        setIframeKey((prev) => prev + 1);

                        // Show success notification
                        setModal({
                          open: true,
                          type: "success",
                          title: "Page actualisée",
                          message:
                            "La page a été actualisée. Essayez maintenant d'activer le hCaptcha.",
                          onClose: () => setModal({ open: false }),
                        });
                      } else {
                        throw new Error("Échec de l'actualisation");
                      }
                    } catch (err) {
                      console.error("Force refresh failed:", err);
                      setModal({
                        open: true,
                        type: "error",
                        title: "Erreur d'actualisation",
                        message:
                          "Impossible d'actualiser la page. Veuillez réessayer.",
                        onClose: () => setModal({ open: false }),
                      });
                    }
                  }}
                  className="inline-flex items-center px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium mr-4"
                >
                  🔄 Actualiser
                </button>

                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        `/api/shopify/debug/${captchaData.sessionId}`
                      );

                      if (response.ok) {
                        const result = await response.json();
                        console.log("Debug analysis:", result);

                        // Show debug info in modal
                        setModal({
                          open: true,
                          type: "confirmation",
                          title: "🔍 Analyse de la page",
                          message: (
                            <div className="max-h-96 overflow-y-auto">
                              <div className="mb-4">
                                <h4 className="font-bold mb-2">
                                  Éléments CAPTCHA trouvés:
                                </h4>
                                {result.pageAnalysis.captchaElements.length >
                                0 ? (
                                  <ul className="list-disc pl-5 text-sm">
                                    {result.pageAnalysis.captchaElements.map(
                                      (el, idx) => (
                                        <li key={idx}>
                                          <strong>{el.selector}</strong> -{" "}
                                          {el.tagName}
                                          {el.visible
                                            ? " (visible)"
                                            : " (caché)"}
                                          - {el.rect.width}×{el.rect.height}px
                                        </li>
                                      )
                                    )}
                                  </ul>
                                ) : (
                                  <p className="text-red-600">
                                    Aucun élément CAPTCHA trouvé!
                                  </p>
                                )}
                              </div>

                              <div className="mb-4">
                                <h4 className="font-bold mb-2">
                                  Iframes trouvées:
                                </h4>
                                {result.pageAnalysis.allIframes.length > 0 ? (
                                  <ul className="list-disc pl-5 text-sm">
                                    {result.pageAnalysis.allIframes.map(
                                      (iframe, idx) => (
                                        <li key={idx}>
                                          {iframe.src || "Sans src"}
                                          {iframe.visible
                                            ? " (visible)"
                                            : " (caché)"}
                                          - {iframe.rect.width}×
                                          {iframe.rect.height}px
                                        </li>
                                      )
                                    )}
                                  </ul>
                                ) : (
                                  <p>Aucune iframe trouvée</p>
                                )}
                              </div>

                              <div className="mb-4">
                                <h4 className="font-bold mb-2">
                                  URL de la page:
                                </h4>
                                <p className="text-sm text-blue-600">
                                  {result.pageAnalysis.url}
                                </p>
                              </div>

                              <div className="mb-4">
                                <h4 className="font-bold mb-2">
                                  Contenu de la page:
                                </h4>
                                <p className="text-xs bg-gray-100 p-2 rounded">
                                  {result.pageAnalysis.pageText}
                                </p>
                              </div>
                            </div>
                          ),
                          onClose: () => setModal({ open: false }),
                          confirmText: "Fermer",
                          onConfirm: () => setModal({ open: false }),
                        });
                      } else {
                        throw new Error("Échec de l'analyse");
                      }
                    } catch (err) {
                      console.error("Debug failed:", err);
                      setModal({
                        open: true,
                        type: "error",
                        title: "Erreur d'analyse",
                        message:
                          "Impossible d'analyser la page. Veuillez réessayer.",
                        onClose: () => setModal({ open: false }),
                      });
                    }
                  }}
                  className="inline-flex items-center px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  🔍 Analyser la page
                </button>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                <p className="text-sm text-yellow-700">
                  <strong>Recommandé :</strong> Cliquez d'abord sur "Activer
                  hCaptcha" pour déclencher le défi, puis résolvez-le
                  directement dans l'aperçu. Si le hCaptcha ne se charge pas,
                  utilisez "Actualiser" puis réessayez.
                </p>
              </div>

              <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                <div className="p-4 bg-gray-100 border-b">
                  <div className="flex items-center justify-center mb-2">
                    <div className="text-2xl mr-2">🤖</div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        hCaptcha - Résolution en direct
                      </p>
                      <p className="text-xs text-gray-500">
                        Une fois activé, résolvez le défi directement ici
                      </p>
                    </div>
                  </div>
                </div>

                <div className="h-96">
                  <iframe
                    key={iframeKey}
                    src={`/api/shopify/live/${captchaData.sessionId}?t=${iframeKey}`}
                    className="w-full h-full border-0"
                    title="hCaptcha Live"
                    style={{ pointerEvents: "auto", opacity: 1 }}
                  />
                </div>
              </div>

              <div className="bg-green-50 border-l-4 border-green-400 p-3 mt-4">
                <p className="text-sm text-green-700">
                  <strong>Astuce :</strong> Une fois le hCaptcha résolu avec
                  succès, cliquez sur "Continuer" ci-dessous pour poursuivre la
                  création de la boutique.
                </p>
              </div>
            </div>

            <div className="p-4 border-t flex justify-end space-x-4">
              <button
                onClick={() => {
                  setCaptchaData(null);
                  setGeneratingFor(null);
                  setIsOpeningStore(false);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              >
                ❌ Annuler
              </button>
              <button
                onClick={continueCaptcha}
                className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700 flex items-center transition-colors"
              >
                <FaCheck className="mr-2" />✅ Continuer (CAPTCHA résolu)
              </button>
            </div>
          </div>
        </div>
      )}

      <NotificationModal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={modal.onClose}
        onConfirm={modal.onConfirm}
      />
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Configuration Shopify
          </h1>
          <input
            type="text"
            placeholder="Rechercher une boutique ou un client..."
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <FaShopify className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                Pour pouvoir créer une boutique Shopify, la boutique doit être{" "}
                <span className="font-semibold">validée</span> et{" "}
                <span className="font-semibold">documentée</span>. Assurez-vous
                que toutes les informations nécessaires sont complétées avant de
                procéder.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <FaSpinner className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {shops
                .filter((shop) => {
                  if (!searchTerm) return true;
                  const searchLower = searchTerm.toLowerCase();
                  return (
                    shop.name.toLowerCase().includes(searchLower) ||
                    shop.clientName.toLowerCase().includes(searchLower)
                  );
                })
                .map((shop) => (
                  <li key={shop._id}>
                    <div className="px-4 py-4 sm:px-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">
                              {shop.name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {shop.clientName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          {shop.hasShopify ? (
                            <>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                <FaCheck className="mr-2 h-4 w-4" />
                                Boutique Shopify configurée
                              </span>
                              {!shop.isParametrized && (
                                <button
                                  onClick={() => handleParametrizeShop(shop)}
                                  className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-blue-50"
                                >
                                  🔧 Paramétrer
                                </button>
                              )}
                              <button
                                onClick={() => handleMarkNotConfigured(shop)}
                                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
                              >
                                Le shop n'a pas de Shopify
                              </button>
                              {!shop.shopifyConfig?.apiKey && (
                                <button
                                  onClick={() => promptApiKeys(shop)}
                                  className="ml-2 text-xs text-blue-600 underline"
                                >
                                  Ajouter clés API
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() =>
                                  handleMarkAlreadyConfigured(shop)
                                }
                                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                              >
                                Le shop a déjà un Shopify
                              </button>
                              <button
                                onClick={() => handleGenerateShopify(shop._id)}
                                disabled={
                                  generatingFor !== null ||
                                  !shop.isValidated ||
                                  !shop.isDocumented
                                }
                                className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                                  generatingFor !== null ||
                                  !shop.isValidated ||
                                  !shop.isDocumented
                                    ? "bg-gray-300 cursor-not-allowed"
                                    : "bg-blue-600 hover:bg-blue-700"
                                }`}
                              >
                                {generatingFor === shop._id ? (
                                  <FaSpinner className="animate-spin h-4 w-4" />
                                ) : (
                                  <>
                                    <FaShopify className="mr-2 h-4 w-4" />
                                    Générer boutique Shopify
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Badges état validation & documentation */}
                      <div className="mt-2">
                        <div className="flex space-x-4 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              shop.isValidated
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {shop.isValidated ? "Validée" : "Non validée"}
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              shop.isDocumented
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {shop.isDocumented
                              ? "Documentée"
                              : "Non documentée"}
                          </span>
                          {shop.hasShopify && (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                shop.isParametrized
                                  ? "bg-blue-100 text-blue-800"
                                  : shop.parametrizationError
                                    ? "bg-red-100 text-red-800"
                                    : "bg-yellow-100 text-yellow-800"
                              }`}
                              title={shop.parametrizationError || ""}
                            >
                              {shop.isParametrized
                                ? "Paramétrisée"
                                : shop.parametrizationError
                                  ? "Erreur paramétrage"
                                  : "Paramétrage en attente"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopifyConfiguration;
