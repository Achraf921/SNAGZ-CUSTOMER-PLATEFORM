import React from "react";

const Page1_InfosGeneralesProjet = ({ formData, handleChange }) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Informations Générales du Projet
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Renseignez les informations de base concernant le projet et le client.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <label
            htmlFor="nomProjet"
            className="block text-sm font-medium text-gray-700"
          >
            Nom de projet <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="nomProjet"
              id="nomProjet"
              value={formData.nomProjet}
              onChange={handleChange}
              required
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="typeProjet"
            className="block text-sm font-medium text-gray-700"
          >
            Type de projet <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="typeProjet"
              id="typeProjet"
              value={formData.typeProjet}
              onChange={handleChange}
              required
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="commercial"
            className="block text-sm font-medium text-gray-700"
          >
            Commercial en charge <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="commercial"
              id="commercial"
              value={formData.commercial}
              onChange={handleChange}
              required
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="demarrageProjet"
            className="block text-sm font-medium text-gray-700"
          >
            Démarrage du projet <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="date"
              name="demarrageProjet"
              id="demarrageProjet"
              value={formData.demarrageProjet}
              onChange={handleChange}
              required
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="nomChefProjet"
            className="block text-sm font-medium text-gray-700"
          >
            Nom chef de projet <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="nomChefProjet"
              id="nomChefProjet"
              value={formData.nomChefProjet}
              onChange={handleChange}
              required
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="prenomChefProjet"
            className="block text-sm font-medium text-gray-700"
          >
            Prénom chef de projet <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="prenomChefProjet"
              id="prenomChefProjet"
              value={formData.prenomChefProjet}
              onChange={handleChange}
              required
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-6">
          <hr className="my-4" />
          <h4 className="text-md leading-6 font-medium text-gray-800">
            Informations Client
          </h4>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="nomClient"
            className="block text-sm font-medium text-gray-700"
          >
            Nom du Client <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="text"
              name="nomClient"
              id="nomClient"
              value={formData.nomClient}
              onChange={handleChange}
              required
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label
            htmlFor="contactsClient"
            className="block text-sm font-medium text-gray-700"
          >
            Email Client <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <input
              type="email"
              name="contactsClient"
              id="contactsClient"
              value={formData.contactsClient}
              onChange={handleChange}
              required
              placeholder="ex: email@example.com"
              pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
              title="Veuillez entrer une adresse email valide."
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page1_InfosGeneralesProjet;
