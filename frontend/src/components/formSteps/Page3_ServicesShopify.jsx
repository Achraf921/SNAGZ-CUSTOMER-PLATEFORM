import React from "react";

const Page3_ServicesShopify = ({ formData, handleChange }) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Services Shopify et Maintenance
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Sélectionnez le type d'abonnement Shopify et décrivez les autres
          services si besoin.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        <div className="sm:col-span-6">
          <fieldset>
            <legend className="text-base font-medium text-gray-900">
              Type d'abonnement Shopify
            </legend>
            <p className="text-sm text-gray-500">Choisissez une option.</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center">
                <input
                  id="abonnementMensuelShopify"
                  name="typeAbonnementShopify"
                  type="radio"
                  value="mensuel"
                  checked={formData.typeAbonnementShopify === "mensuel"}
                  onChange={handleChange}
                  className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300"
                />
                <label
                  htmlFor="abonnementMensuelShopify"
                  className="ml-3 block text-sm font-medium text-gray-700"
                >
                  Abonnement mensuel SHOPIFY (sans engagement)
                </label>
              </div>

              <div className="flex items-center">
                <input
                  id="abonnementAnnuelShopify"
                  name="typeAbonnementShopify"
                  type="radio"
                  value="annuel"
                  checked={formData.typeAbonnementShopify === "annuel"}
                  onChange={handleChange}
                  className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300"
                />
                <label
                  htmlFor="abonnementAnnuelShopify"
                  className="ml-3 block text-sm font-medium text-gray-700"
                >
                  Abonnement annuel SHOPIFY (12 mois)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  id="aucunAbonnementShopify"
                  name="typeAbonnementShopify"
                  type="radio"
                  value="aucun"
                  checked={
                    formData.typeAbonnementShopify === "aucun" ||
                    formData.typeAbonnementShopify === ""
                  }
                  onChange={handleChange}
                  className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300"
                />
                <label
                  htmlFor="aucunAbonnementShopify"
                  className="ml-3 block text-sm font-medium text-gray-700"
                >
                  Aucun / Pas d'abonnement Shopify géré via ce projet
                </label>
              </div>
            </div>
          </fieldset>
        </div>

        {/* Informational Text for Shopify Prices - Moved here and updated */}
        <div className="sm:col-span-6 pt-6">
          <h4 className="text-md font-medium text-gray-900">
            Tarifs Abonnement Shopify (à titre indicatif) :
          </h4>
          <ul className="list-disc list-inside mt-2 text-sm text-gray-600 space-y-1">
            <li>Plan Mensuel : 105 € / mois</li>
            <li>Plan Annuel : 948 € / an (soit 79 € / mois)</li>
          </ul>
          <p className="mt-1 text-xs text-gray-500">
            Ces tarifs sont directement facturés par Shopify et peuvent être
            sujets à modification.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Page3_ServicesShopify;
