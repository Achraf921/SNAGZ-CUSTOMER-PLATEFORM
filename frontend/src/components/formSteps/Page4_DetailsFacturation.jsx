import React from "react";

// Simple placeholder for an alert/info icon (e.g., exclamation mark in a circle)
const InfoIcon = () => (
  <svg
    className="h-5 w-5 text-red-500 mr-1 inline-block"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
      clipRule="evenodd"
    />
  </svg>
);

const Page4_DetailsFacturation = ({ formData, handleChange }) => {
  // Calculate dynamic creation cost
  let creationCost = 0;
  if (formData.estBoutiqueEnLigne) {
    creationCost += 250;
  }
  // Only add design cost if an online store is being created AND design is selected
  if (formData.estBoutiqueEnLigne && formData.snaResponsableDesign === "oui") {
    creationCost += 250;
  }

  const isDesignDisabled = !formData.estBoutiqueEnLigne;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main form content (left/center column) */}
      <div className="lg:col-span-2 space-y-8">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Détails de la Boutique et Services Design
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Précisez si une nouvelle boutique doit être créée et les besoins en
            design.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="estBoutiqueEnLigne"
                  name="estBoutiqueEnLigne"
                  type="checkbox"
                  checked={formData.estBoutiqueEnLigne}
                  onChange={handleChange}
                  className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor="estBoutiqueEnLigne"
                  className="font-medium text-gray-700"
                >
                  Doit-on créer une nouvelle boutique en ligne ?
                </label>
              </div>
            </div>
          </div>

          <div className="sm:col-span-6">
            <label
              className={`block text-sm font-medium ${
                isDesignDisabled ? "text-gray-400" : "text-gray-700"
              }`}
            >
              SNA doit-il s'occuper du web design/direction artistique ?{" "}
              <span className="text-red-500">*</span>
            </label>
            <div className="mt-2 flex items-center space-x-6">
              <div className="flex items-center">
                <input
                  id="snaDesignOui"
                  name="snaResponsableDesign"
                  type="radio"
                  value="oui"
                  checked={formData.snaResponsableDesign === "oui"}
                  onChange={handleChange}
                  required
                  disabled={isDesignDisabled}
                  className={`focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300 ${
                    isDesignDisabled ? "cursor-not-allowed bg-gray-100" : ""
                  }`}
                />
                <label
                  htmlFor="snaDesignOui"
                  className={`ml-2 block text-sm ${
                    isDesignDisabled
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-gray-900"
                  }`}
                >
                  Oui
                </label>
              </div>
              <div className="flex items-center">
                <input
                  id="snaDesignNon"
                  name="snaResponsableDesign"
                  type="radio"
                  value="non"
                  checked={formData.snaResponsableDesign === "non"}
                  onChange={handleChange}
                  required
                  disabled={isDesignDisabled}
                  className={`focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300 ${
                    isDesignDisabled ? "cursor-not-allowed bg-gray-100" : ""
                  }`}
                />
                <label
                  htmlFor="snaDesignNon"
                  className={`ml-2 block text-sm ${
                    isDesignDisabled
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-gray-900"
                  }`}
                >
                  Non
                </label>
              </div>
            </div>
          </div>

          {/* New Checkboxes for Delivengo and Mondial Relay */}
          <div className="sm:col-span-6 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modules d'expédition optionnels :
            </label>
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="moduleDelivengo"
                    name="moduleDelivengo"
                    type="checkbox"
                    checked={formData.moduleDelivengo}
                    onChange={handleChange}
                    className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label
                    htmlFor="moduleDelivengo"
                    className="font-medium text-gray-700"
                  >
                    Ajouter le module Delivengo (34 € 44 pays jusqu'à 2 kg)
                  </label>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="moduleMondialRelay"
                    name="moduleMondialRelay"
                    type="checkbox"
                    checked={formData.moduleMondialRelay}
                    onChange={handleChange}
                    className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label
                    htmlFor="moduleMondialRelay"
                    className="font-medium text-gray-700"
                  >
                    Ajouter le module Mondial Relay (34 €)
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Summary Block (right column on larger screens) */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-gray-50 p-6 rounded-lg shadow">
          <h4 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
            Estimation Création Boutique
          </h4>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">
                Frais de création initiaux :
              </span>
              <span className="text-xl font-bold text-gray-800">
                {creationCost} €
              </span>
            </div>

            {formData.estBoutiqueEnLigne && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-red-600 font-semibold">
                  <InfoIcon />
                  Frais mensuels liés à la maintenance du site internet : 50 €
                </p>
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Les modules optionnels (Delivengo, Mondial Relay) et l'abonnement
            Shopify sont facturés séparément. Cette estimation est pour la
            création et configuration initiale par SNA GZ.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Page4_DetailsFacturation;
