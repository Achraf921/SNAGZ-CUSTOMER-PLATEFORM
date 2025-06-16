import React from "react";

const Page2_PlanningLancement = ({ formData, handleChange }) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Planning et Lancement
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Définissez les dates clés et les options de lancement.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <label
            htmlFor="dateMiseEnLigne"
            className="block text-sm font-medium text-gray-700"
          >
            Date de Mise en Ligne Prévue
          </label>
          <div className="mt-1">
            <input
              type="date"
              name="dateMiseEnLigne"
              id="dateMiseEnLigne"
              value={formData.dateMiseEnLigne}
              onChange={handleChange}
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="dateCommercialisation"
            className="block text-sm font-medium text-gray-700"
          >
            Date de Commercialisation
          </label>
          <div className="mt-1">
            <input
              type="date"
              name="dateCommercialisation"
              id="dateCommercialisation"
              value={formData.dateCommercialisation}
              onChange={handleChange}
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="dateSortieOfficielle"
            className="block text-sm font-medium text-gray-700"
          >
            Date de Sortie Officielle
          </label>
          <div className="mt-1">
            <input
              type="date"
              name="dateSortieOfficielle"
              id="dateSortieOfficielle"
              value={formData.dateSortieOfficielle}
              onChange={handleChange}
              className="shadow-sm focus:ring-sna-primary focus:border-sna-primary block w-full sm:text-sm border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div className="sm:col-span-6">
          <div className="flex items-center space-x-8 pt-4">
            <div className="relative flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="precommande"
                  name="precommande"
                  type="checkbox"
                  checked={formData.precommande}
                  onChange={handleChange}
                  className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor="precommande"
                  className="font-medium text-gray-700"
                >
                  Précommande envisagée ?
                </label>
              </div>
            </div>

            <div className="relative flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="dedicaceEnvisagee"
                  name="dedicaceEnvisagee"
                  type="checkbox"
                  checked={formData.dedicaceEnvisagee}
                  onChange={handleChange}
                  className="focus:ring-sna-primary h-4 w-4 text-sna-primary border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor="dedicaceEnvisagee"
                  className="font-medium text-gray-700"
                >
                  Dédicace envisagée ?
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page2_PlanningLancement;
