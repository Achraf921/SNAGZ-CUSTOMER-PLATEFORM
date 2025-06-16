import React from "react";
import Articles from "./Articles";

const ParametresFacturation = ({
  formData,
  handleChange,
  handleArrayChange,
  addArrayItem,
  removeArrayItem,
}) => {
  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900">
          Paramètres de facturation
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              SIRET
            </label>
            <input
              type="text"
              name="siret"
              value={formData.siret || ""}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Numéro de TVA
            </label>
            <input
              type="text"
              name="tvaNumber"
              value={formData.tvaNumber || ""}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-8">
        <Articles
          formData={formData}
          handleChange={handleChange}
          handleArrayChange={handleArrayChange}
          addArrayItem={addArrayItem}
          removeArrayItem={removeArrayItem}
        />
      </div>
    </div>
  );
};

export default ParametresFacturation;
