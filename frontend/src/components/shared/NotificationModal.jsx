import React, { useState } from "react";
import {
  FaInfoCircle,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimes,
  FaSpinner,
  FaExclamationCircle,
} from "react-icons/fa";

const API_INSTRUCTIONS = [
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
    ],
  },
];

const ApiKeysContent = ({ onConfirm, onClose, shop }) => {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onConfirm({ apiKey, apiSecret, accessToken });
    } catch (e) {
      setError(e.message || "Une erreur est survenue.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="apiKey"
            className="block text-sm font-medium text-gray-700"
          >
            Clé API
          </label>
          <input
            type="text"
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
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
          <input
            type="text"
            id="apiSecret"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="accessToken"
            className="block text-sm font-medium text-gray-700"
          >
            Jeton d'accès à l'API Admin (mot de passe)
          </label>
          <input
            type="password"
            id="accessToken"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={() => setShowTutorial(!showTutorial)}
          className="text-sm text-blue-600 hover:underline"
        >
          {showTutorial
            ? "Masquer le tutoriel"
            : "Tutoriel – créer l'app dans Shopify"}
        </button>
        {showTutorial && (
          <div className="mt-2 p-4 bg-gray-50 border rounded-lg space-y-6 max-h-[40vh] overflow-y-auto">
            <h4 className="text-base font-semibold text-gray-800">
              Création d'une application personnalisée pour l'accès API.
            </h4>
            <div className="space-y-4">
              <h5 className="font-medium text-gray-700">Instructions:</h5>
              {API_INSTRUCTIONS.map((instruction, index) => {
                if (instruction.title) {
                  return (
                    <div key={`path-${index}`} className="pl-2">
                      <h6 className="font-semibold text-gray-800 mb-2">
                        {instruction.title}
                      </h6>
                      <ol className="space-y-3">
                        {instruction.steps.map((step, stepIndex) => {
                          if (typeof step === "string") {
                            return (
                              <li
                                key={`inst-${stepIndex}`}
                                className="flex items-start space-x-2 text-sm"
                              >
                                <span className="text-blue-500 font-medium">
                                  {stepIndex + 1}.
                                </span>
                                <span className="text-gray-700">{step}</span>
                              </li>
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
                                className={`my-2 p-3 border rounded-md ${
                                  noticeStyles[step.level] ||
                                  noticeStyles.warning
                                }`}
                              >
                                <div className="flex items-center">
                                  <FaExclamationCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                                  <p className="font-bold text-sm">
                                    {step.text}
                                  </p>
                                </div>
                              </div>
                            );
                          } else if (step.type === "api_scopes") {
                            return (
                              <div
                                key={`api-scopes-${stepIndex}`}
                                className="my-2 p-3 bg-gray-100 border rounded-md"
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
                                        readOnly
                                        checked
                                        className="h-4 w-4 mt-1 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                                      />
                                      <div className="ml-3 text-sm">
                                        <label className="font-mono bg-gray-200 px-1 py-0.5 rounded text-xs">
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
                          }
                          return null;
                        })}
                      </ol>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 text-center">{error}</p>
      )}

      <div className="mt-6 flex justify-end space-x-3">
        <button
          type="button"
          onClick={onClose}
          className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSaving && (
            <FaSpinner className="animate-spin -ml-1 mr-3 h-5 w-5" />
          )}
          Enregistrer les clés
        </button>
      </div>
    </>
  );
};

const NotificationModal = ({
  open,
  type,
  title,
  message,
  onClose,
  onConfirm,
  shop,
}) => {
  if (!open) return null;

  const getIcon = () => {
    switch (type) {
      case "success":
        return (
          <FaCheckCircle
            className="h-6 w-6 text-green-400"
            aria-hidden="true"
          />
        );
      case "warning":
        return (
          <FaExclamationTriangle
            className="h-6 w-6 text-yellow-400"
            aria-hidden="true"
          />
        );
      case "error":
        return <FaTimes className="h-6 w-6 text-red-400" aria-hidden="true" />;
      default:
        return (
          <FaInfoCircle className="h-6 w-6 text-blue-400" aria-hidden="true" />
        );
    }
  };

  const renderContent = () => {
    if (type === "api_keys") {
      return (
        <ApiKeysContent onConfirm={onConfirm} onClose={onClose} shop={shop} />
      );
    }

    return (
      <>
        <p className="text-sm text-gray-500">{message}</p>
        <div className="mt-4 flex justify-end space-x-3">
          {type === "confirmation" && (
            <button
              type="button"
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={onClose}
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            className="bg-blue-600 text-white py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium hover:bg-blue-700"
            onClick={type === "confirmation" ? onConfirm : onClose}
          >
            {type === "confirmation" ? "Confirmer" : "OK"}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
        >
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="sm:flex sm:items-start">
            <div
              className={`mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full ${
                type === "error" ? "bg-red-100" : "bg-blue-100"
              } sm:mx-0 sm:h-10 sm:w-10`}
            >
              {getIcon()}
            </div>
            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
              <h3
                className="text-lg leading-6 font-medium text-gray-900"
                id="modal-title"
              >
                {title}
              </h3>
              <div className="mt-2">{renderContent()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
