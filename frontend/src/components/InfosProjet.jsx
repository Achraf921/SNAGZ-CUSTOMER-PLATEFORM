import React from "react";

const InfosProjet = ({ formData, handleChange }) => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Informations du projet
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Renseignez les informations de base de votre boutique.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div>
          <label
            htmlFor="shopName"
            className="block text-sm font-medium text-gray-700"
          >
            Nom de la boutique
          </label>
          <input
            type="text"
            name="shopName"
            id="shopName"
            value={formData.shopName}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
            placeholder="Ex: WLR Store"
          />
        </div>

        <div>
          <label
            htmlFor="shopDescription"
            className="block text-sm font-medium text-gray-700"
          >
            Description de la boutique
          </label>
          <textarea
            name="shopDescription"
            id="shopDescription"
            rows={4}
            value={formData.shopDescription}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
            placeholder="Décrivez votre boutique en quelques phrases..."
          />
          <p className="mt-2 text-sm text-gray-500">
            Cette description sera visible sur votre page boutique.
          </p>
        </div>
      </div>
    </div>
  );
};

export default InfosProjet;
