import React, { useState } from "react";
import { FiTrash2, FiEdit, FiSave, FiX } from "react-icons/fi";
import NotificationModal from "../shared/NotificationModal";

const ClientShopsDisplay = ({
  shops,
  clientId,
  onShopDeleted,
  onShopUpdated,
}) => {
  const [editingShopId, setEditingShopId] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [modal, setModal] = useState({ open: false });

  if (!shops || shops.length === 0) {
    return (
      <p className="mt-4 text-gray-500">
        Ce client n'a pas encore de boutiques enregistrées.
      </p>
    );
  }

  const handleDelete = async (shopIdToDelete) => {
    const shopIdString = String(shopIdToDelete);

    showModal({
      type: "confirmation",
      title: "Supprimer la boutique",
      message: `Êtes-vous sûr de vouloir supprimer la boutique ID: ${shopIdString} ?`,
      onClose: () => setModal({ open: false }),
      onConfirm: async () => {
        setModal({ open: false });
        try {
          const response = await fetch(
            `http://localhost:3000/api/internal/clients/${clientId}/shops/${shopIdString}`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
            }
          );

          const data = await response.json();

          if (response.ok) {
            showModal({
              type: "success",
              title: "Supprimée",
              message: "Boutique supprimée avec succès !",
              onClose: () => setModal({ open: false }),
            });
            if (onShopDeleted) {
              onShopDeleted(shopIdString, data.updatedClient);
            }
          } else {
            throw new Error(
              data.message || "Erreur lors de la suppression de la boutique."
            );
          }
        } catch (error) {
          console.error("Failed to delete shop:", error);
          showModal({
            type: "error",
            title: "Erreur",
            message: `Erreur: ${error.message}`,
            onClose: () => setModal({ open: false }),
          });
        }
      },
    });
  };

  const startEditing = (shop) => {
    setEditingShopId(shop.shopId || shop._id);
    setEditValues({ ...shop });
  };

  const cancelEditing = () => {
    setEditingShopId(null);
  };

  const handleFieldChange = (field, value) => {
    setEditValues({ ...editValues, [field]: value });
  };

  const saveChanges = async () => {
    setIsSaving(true);
    const payload = { ...editValues };

    // Remove internal fields that shouldn't be updated
    delete payload._id;
    delete payload.shopId;

    try {
      // Handle JSON parsing for object fields
      for (const field in payload) {
        if (
          typeof payload[field] === "string" &&
          payload[field].trim().startsWith("{")
        ) {
          try {
            payload[field] = JSON.parse(payload[field]);
          } catch (e) {
            // If not valid JSON, leave as string
          }
        }
      }

      const response = await fetch(
        `http://localhost:3000/api/internal/clients/${clientId}/shops/${editingShopId}?_=${new Date().getTime()}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          body: JSON.stringify(payload),
          credentials: "include",
        }
      );

      const data = await response.json();
      if (response.ok && data.success) {
        if (onShopUpdated) {
          onShopUpdated(data);
        }
        cancelEditing();
      } else {
        throw new Error(
          data.message || "Erreur lors de la mise à jour de la boutique."
        );
      }
    } catch (error) {
      console.error("Failed to update shop:", error);
      showModal({
        type: "error",
        title: "Erreur",
        message: `Erreur: ${error.message}`,
        onClose: () => setModal({ open: false }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveField = async (shop, field) => {
    setIsSaving(true);
    const payload = { [field]: editValues[field] };

    try {
      const response = await fetch(
        `http://localhost:3000/api/internal/clients/${clientId}/shops/${editingShopId}?_=${new Date().getTime()}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          body: JSON.stringify(payload),
          credentials: "include",
        }
      );

      const data = await response.json();
      if (response.ok && data.success) {
        if (onShopUpdated) {
          onShopUpdated(data);
        }
        setEditingField(null);
      } else {
        throw new Error(
          data.message || "Erreur lors de la mise à jour de la boutique."
        );
      }
    } catch (error) {
      console.error("Failed to update shop:", error);
      showModal({
        type: "error",
        title: "Erreur",
        message: `Erreur: ${error.message}`,
        onClose: () => setModal({ open: false }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderFieldValue = (shop, field, value) => {
    const fieldType = typeof value;
    const isEditingShop = editingShopId === (shop.shopId || shop._id);
    const isEditingField = isEditingShop && editingField === field;

    if (isEditingField) {
      // Special handling for Type abonnement shopify
      if (field === "typeAbonnementShopify") {
        return (
          <div className="flex items-center space-x-2">
            <select
              value={editValues[field] || ""}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              className="border rounded p-1 text-sm flex-1"
            >
              <option value="aucun">Aucun</option>
              <option value="mensuel">Mensuel</option>
              <option value="annuel">Annuel</option>
            </select>
            <div className="flex space-x-1">
              <button
                onClick={() => saveField(shop, field)}
                disabled={isSaving}
                className="p-1 text-green-600 hover:text-green-800"
                title="Enregistrer"
              >
                <FiSave size={16} />
              </button>
              <button
                onClick={() => setEditingField(null)}
                className="p-1 text-red-600 hover:text-red-800"
                title="Annuler"
              >
                <FiX size={16} />
              </button>
            </div>
          </div>
        );
      }

      // Special handling for specific fields that should have Oui/Non dropdowns
      const ouiNonFields = [
        "precommande",
        "dedicaceEnvisagee",
        "snaResponsableDesign",
        "moduleDelivengo",
        "moduleMondialRelay",
      ];

      if (ouiNonFields.includes(field)) {
        const currentValue = editValues[field];
        // Determine if this is a boolean field or string field
        const isBooleanField = typeof value === "boolean";

        return (
          <div className="flex items-center space-x-2">
            <select
              value={
                isBooleanField
                  ? currentValue
                    ? "Oui"
                    : "Non"
                  : currentValue || "Non"
              }
              onChange={(e) => {
                const selectedValue = e.target.value;
                if (isBooleanField) {
                  handleFieldChange(field, selectedValue === "Oui");
                } else {
                  handleFieldChange(field, selectedValue);
                }
              }}
              className="border rounded p-1 text-sm flex-1"
            >
              <option value="Oui">Oui</option>
              <option value="Non">Non</option>
            </select>
            <div className="flex space-x-1">
              <button
                onClick={() => saveField(shop, field)}
                disabled={isSaving}
                className="p-1 text-green-600 hover:text-green-800"
                title="Enregistrer"
              >
                <FiSave size={16} />
              </button>
              <button
                onClick={() => setEditingField(null)}
                className="p-1 text-red-600 hover:text-red-800"
                title="Annuler"
              >
                <FiX size={16} />
              </button>
            </div>
          </div>
        );
      }

      // Render input field based on type for other fields
      if (fieldType === "boolean") {
        return (
          <div className="flex items-center space-x-2">
            <select
              value={editValues[field]}
              onChange={(e) =>
                handleFieldChange(field, e.target.value === "true")
              }
              className="border rounded p-1 text-sm flex-1"
            >
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
            <div className="flex space-x-1">
              <button
                onClick={() => saveField(shop, field)}
                disabled={isSaving}
                className="p-1 text-green-600 hover:text-green-800"
                title="Enregistrer"
              >
                <FiSave size={16} />
              </button>
              <button
                onClick={() => setEditingField(null)}
                className="p-1 text-red-600 hover:text-red-800"
                title="Annuler"
              >
                <FiX size={16} />
              </button>
            </div>
          </div>
        );
      } else if (fieldType === "object" && value !== null) {
        return (
          <div className="space-y-2">
            <textarea
              value={
                typeof editValues[field] === "string"
                  ? editValues[field]
                  : JSON.stringify(editValues[field], null, 2)
              }
              onChange={(e) => handleFieldChange(field, e.target.value)}
              className="border rounded p-1 w-full font-mono text-xs"
              rows="3"
            />
            <div className="flex justify-end space-x-1">
              <button
                onClick={() => saveField(shop, field)}
                disabled={isSaving}
                className="p-1 text-green-600 hover:text-green-800"
                title="Enregistrer"
              >
                <FiSave size={16} />
              </button>
              <button
                onClick={() => setEditingField(null)}
                className="p-1 text-red-600 hover:text-red-800"
                title="Annuler"
              >
                <FiX size={16} />
              </button>
            </div>
          </div>
        );
      } else {
        return (
          <div className="flex items-center space-x-2">
            <input
              type={field.toLowerCase().includes("date") ? "date" : "text"}
              value={editValues[field] || ""}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              className="border rounded p-1 text-sm flex-1"
            />
            <div className="flex space-x-1">
              <button
                onClick={() => saveField(shop, field)}
                disabled={isSaving}
                className="p-1 text-green-600 hover:text-green-800"
                title="Enregistrer"
              >
                <FiSave size={16} />
              </button>
              <button
                onClick={() => setEditingField(null)}
                className="p-1 text-red-600 hover:text-red-800"
                title="Annuler"
              >
                <FiX size={16} />
              </button>
            </div>
          </div>
        );
      }
    }

    // Helper function to format display values
    const formatDisplayValue = (field, value) => {
      // Special handling for specific fields
      const ouiNonFields = [
        "precommande",
        "dedicaceEnvisagee",
        "snaResponsableDesign",
        "moduleDelivengo",
        "moduleMondialRelay",
      ];

      if (field === "typeAbonnementShopify") {
        return value || "Aucun";
      }

      if (ouiNonFields.includes(field)) {
        if (typeof value === "boolean") {
          return value ? "Oui" : "Non";
        }
        return value || "Non";
      }

      // Default formatting
      if (fieldType === "boolean") {
        return value ? "Oui" : "Non";
      } else if (
        value instanceof Date ||
        (fieldType === "string" && field.toLowerCase().includes("date"))
      ) {
        return new Date(value).toLocaleDateString();
      } else if (fieldType === "object" && value !== null) {
        return JSON.stringify(value, null, 2);
      }
      return String(value || "N/A");
    };

    // Display read-only value with edit button when shop is in edit mode
    if (isEditingShop) {
      return (
        <div className="flex items-center justify-between">
          <span className="flex-1">{formatDisplayValue(field, value)}</span>
          <button
            onClick={() => {
              setEditingField(field);
              setEditValues({ ...editValues, [field]: value });
            }}
            className="ml-2 p-1 text-blue-600 hover:text-blue-800"
            title="Modifier"
          >
            <FiEdit size={16} />
          </button>
        </div>
      );
    }

    // Default read-only display when not in edit mode
    return formatDisplayValue(field, value);
  };

  const showModal = (options) => setModal({ open: true, ...options });

  return (
    <>
      <NotificationModal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={modal.onClose}
        onConfirm={modal.onConfirm}
      />
      <div className="mt-6 p-6 bg-white shadow-lg rounded-lg">
        <h3 className="text-xl font-semibold text-gray-800 mb-6">
          Boutiques associées au client
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nom du Projet
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documenté
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shopify
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {shops.map((shop) => (
                <React.Fragment key={shop.shopId || shop._id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-700">
                      {shop.nomProjet || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          shop.status === "valid"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {shop.status === "valid" ? "Validée" : "En attente"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          shop.documented
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {shop.documented ? "Oui" : "Non"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          shop.hasShopify
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {shop.hasShopify ? "Oui" : "Non"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      {editingShopId === (shop.shopId || shop._id) ? (
                        <>
                          <button
                            onClick={saveChanges}
                            disabled={isSaving}
                            className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-full transition-colors duration-150 ease-in-out"
                            title="Enregistrer"
                          >
                            <FiSave size={18} />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-full transition-colors duration-150 ease-in-out"
                            title="Annuler"
                          >
                            <FiX size={18} />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEditing(shop)}
                          className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full transition-colors duration-150 ease-in-out"
                          title="Modifier"
                        >
                          <FiEdit size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(shop.shopId || shop._id)}
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-full transition-colors duration-150 ease-in-out"
                        title="Supprimer la boutique"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded row for editing */}
                  {editingShopId === (shop.shopId || shop._id) && (
                    <tr>
                      <td colSpan="5" className="px-6 py-4 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Object.entries(shop)
                            .filter(
                              ([key]) =>
                                ![
                                  "_id",
                                  "shopId",
                                  "createdAt",
                                  "updatedAt",
                                  "status",
                                  "coutsEtDetailsModuleMondialRelay",
                                  "coutsEtDetailsModuleDelivengo",
                                  "coutsEtDetailsMaintenanceSite",
                                  "hasShopify",
                                  "shop",
                                  "success",
                                  "shopifyCreatedAt", // Exclude Shopify Created At
                                  "documented", // Exclude Documented
                                  "compteClientRef", // Exclude Compte Client Ref
                                ].includes(key)
                            )
                            .map(([field, value]) => (
                              <div key={field} className="mb-2">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-sm font-medium text-gray-700 capitalize">
                                    {field
                                      .replace(/([A-Z])/g, " $1")
                                      .replace(/^./, (str) =>
                                        str.toUpperCase()
                                      )}
                                  </span>
                                </div>

                                <div className="p-2 border rounded bg-white">
                                  {renderFieldValue(shop, field, value)}
                                </div>
                              </div>
                            ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default ClientShopsDisplay;
