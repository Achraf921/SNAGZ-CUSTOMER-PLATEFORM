import React from "react";

const InfosClient = ({ formData, handleChange }) => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Informations du client
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          Renseignez les informations de contact du propriétaire de la boutique.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div>
          <label
            htmlFor="clientName"
            className="block text-sm font-medium text-gray-700"
          >
            Nom complet
          </label>
          <input
            type="text"
            name="clientName"
            id="clientName"
            value={formData.clientName}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
            placeholder="Ex: John Doe"
          />
        </div>

        <div>
          <label
            htmlFor="clientEmail"
            className="block text-sm font-medium text-gray-700"
          >
            Adresse email
          </label>
          <input
            type="email"
            name="clientEmail"
            id="clientEmail"
            value={formData.clientEmail}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
            placeholder="Ex: john.doe@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="clientPhone"
            className="block text-sm font-medium text-gray-700"
          >
            Numéro de téléphone
          </label>
          <input
            type="tel"
            name="clientPhone"
            id="clientPhone"
            value={formData.clientPhone}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
            placeholder="Ex: +33 6 12 34 56 78"
          />
        </div>
      </div>
    </div>
  );
};

export default InfosClient;
