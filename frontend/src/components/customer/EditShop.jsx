import React, { useState, useEffect } from "react";

const INTERNAL_FIELDS = [
  "shopId", "createdAt", "updatedAt", "_id", "status"
];

const EditShop = ({ shop, isOpen, onClose, onSave }) => {
  const [shopData, setShopData] = useState(shop || {});
  const [error, setError] = useState(null);

  useEffect(() => {
    setShopData(shop || {});
    setError(null);
  }, [shop]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setShopData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!shopData) return;
    try {
      onSave(shopData);
    } catch (err) {
      setError("Erreur lors de la sauvegarde des modifications.");
    }
  };

  // Get all editable fields from shopData
  const editableFields = Object.keys(shopData || {}).filter(
    key => !INTERNAL_FIELDS.includes(key)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-2xl font-bold"
          aria-label="Fermer"
        >
          ×
        </button>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Modifier la Boutique
        </h2>
        {error && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          {editableFields.length === 0 && (
            <div className="text-gray-500">Aucun champ éditable pour cette boutique.</div>
          )}
          {editableFields.map((field) => (
            <div key={field}>
              <label
                htmlFor={field}
                className="block text-sm font-medium text-gray-700 capitalize"
              >
                {field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
              </label>
              {typeof shopData[field] === 'boolean' ? (
                <input
                  type="checkbox"
                  name={field}
                  id={field}
                  checked={!!shopData[field]}
                  onChange={handleChange}
                  className="mt-1"
                />
              ) : typeof shopData[field] === 'object' && shopData[field] !== null ? (
                <textarea
                  name={field}
                  id={field}
                  value={JSON.stringify(shopData[field], null, 2)}
                  disabled
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-gray-100 text-gray-500"
                />
              ) : (
                <input
                  type="text"
                  name={field}
                  id={field}
                  value={shopData[field] || ""}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary"
                />
              )}
            </div>
          ))}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
            >
              Enregistrer les modifications
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditShop;
