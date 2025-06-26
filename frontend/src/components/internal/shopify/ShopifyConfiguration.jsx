import React, { useState, useEffect, useRef } from "react";
import { FaShopify, FaCheck, FaSpinner } from "react-icons/fa";
import NotificationModal from "../../shared/NotificationModal";

const ShopifyConfiguration = () => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatingFor, setGeneratingFor] = useState(null);
  const [captchaData, setCaptchaData] = useState(null);
  const [modal, setModal] = useState({ open: false });
  const [otp, setOtp] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const otpRef = useRef("");

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
            raw: shop,
          }));
          return [...acc, ...mapped];
        }
        return acc;
      }, []);

      setShops(processedShops);
      setError(null);
    } catch (err) {
      console.error("Erreur:", err);
      setError("Une erreur est survenue lors du chargement des boutiques.");
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
        return;
      }

      if (!response.ok) {
        console.log("[ShopifyConfig] Response not OK:", response.status);
        throw new Error("Erreur lors de la génération");
      }

      // Normal success flow
      console.log("[ShopifyConfig] Normal success flow");
      await fetchShops(); // Rafraîchir la liste
      console.log("[ShopifyConfig] Génération terminée pour", shopId);
      setModal({
        open: true,
        type: "success",
        title: "Boutique générée",
        message: "La boutique Shopify a été créée avec succès.",
        onClose: () => setModal({ open: false }),
      });
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                🤖 CAPTCHA - Vérification humaine requise
              </h3>
              <p className="text-sm text-gray-600 mt-2">
                Shopify demande une vérification CAPTCHA avant de continuer.
              </p>
            </div>

            <div className="p-6">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                <div className="flex">
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-blue-800">
                      Instructions :
                    </h4>
                    <div className="mt-2 text-sm text-blue-700">
                      <ol className="list-decimal list-inside space-y-1">
                        <li>
                          Cliquez sur "Ouvrir CAPTCHA" pour ouvrir la page de
                          vérification
                        </li>
                        <li>Résolvez le CAPTCHA dans le nouvel onglet</li>
                        <li>
                          Une fois résolu, revenez ici et cliquez sur
                          "Continuer"
                        </li>
                        <li>Ne fermez pas cet onglet pendant le processus</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <a
                  href={captchaData.captchaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  🔗 Ouvrir CAPTCHA dans un nouvel onglet
                </a>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      <strong>Important :</strong> Assurez-vous que le CAPTCHA
                      est complètement résolu avant de cliquer sur "Continuer".
                      Si vous fermez l'onglet ou attendez trop longtemps, vous
                      devrez recommencer le processus.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex justify-end space-x-4">
              <button
                onClick={() => {
                  setCaptchaData(null);
                  setGeneratingFor(null);
                  setIsOpeningStore(false); // Reset the opening store state if CAPTCHA is cancelled
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
                              <button
                                onClick={() => handleMarkNotConfigured(shop)}
                                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
                              >
                                Le shop n'a pas de Shopify
                              </button>
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
                        <div className="flex space-x-4">
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
