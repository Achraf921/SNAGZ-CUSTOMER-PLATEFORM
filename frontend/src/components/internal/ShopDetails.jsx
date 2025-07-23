import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { FaEdit, FaSave, FaTimes, FaTrash } from "react-icons/fa";

const ConfirmationModal = ({ isOpen, onClose, onConfirm, shopName }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Confirmer la suppression
        </h3>
        <p className="text-gray-600 mb-6">
          Êtes-vous sûr de vouloir supprimer la boutique "{shopName}" ? Cette
          action est irréversible.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ShopDetails = ({ clientId, shopId, onDelete }) => {
  const [shop, setShop] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchShopDetails = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/internal/clients/${clientId}/shops/${shopId}`
        );

        if (!response.ok) throw new Error("Failed to fetch shop details");

        const data = await response.json();
        const shopData = data.shop || data; // Handle both response formats
        console.log("Shop data:", shopData);

        if (!shopData || typeof shopData !== "object") {
          throw new Error("Invalid shop data format");
        }

        setShop(shopData);
        setError(null);
      } catch (err) {
        console.error("Error details:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchShopDetails();
  }, [clientId, shopId]);

  const handleDelete = async () => {
    try {
      const response = await fetch(
        `/api/internal/clients/${clientId}/shops/${shopId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("La suppression de la boutique a échoué");
      }

      // alert("Boutique supprimée avec succès !");
      setIsModalOpen(false);
      if (onDelete) {
        onDelete(shopId); // Notify parent to refresh
      }
    } catch (err) {
      console.error("Erreur lors de la suppression:", err);
      // Gérer l'état d'erreur, par exemple, afficher une notification
      alert(err.message); // Simple alert for now
    }
  };

  const getFieldValue = (field) => {
    const value = shop[field.key];
    if (value === undefined || value === null) return "Non spécifié";
    if (field.type === "date" && value)
      return new Date(value).toLocaleDateString();
    if (field.type === "checkbox")
      return value ? field.trueLabel : field.falseLabel;
    if (field.type === "input") return value;
    return value;
  };

  const handleEdit = (field) => {
    setEditingField(field.key);
    setFieldValues({ ...fieldValues, [field.key]: shop[field.key] });
  };

  const handleSave = async (field) => {
    try {
      const response = await fetch(
        `/api/internal/clients/${clientId}/shops/${shopId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field.key]: fieldValues[field.key] }),
        }
      );

      if (!response.ok) throw new Error("Failed to update shop");

      const updatedData = await response.json();
      const updatedShop = updatedData.shop || updatedData;
      setShop(updatedShop);
      setEditingField(null);
    } catch (err) {
      console.error("Error updating field:", err);
      setError(err.message);
    }
  };

  const handleCancel = () => {
    setEditingField(null);
  };

  const handleChange = (field, value) => {
    setFieldValues({ ...fieldValues, [field.key]: value });
  };

  if (isLoading) return <p>Chargement des détails de la boutique...</p>;
  if (error) return <p>Erreur: {error}</p>;
  if (!shop) return <p>Boutique non trouvée.</p>;

  console.log("Shop data in state:", shop);

  const displayFields = [
    { key: "nomProjet", label: "Nom Projet", type: "text" },
    { key: "typeProjet", label: "Type Projet", type: "text" },
    { key: "commercial", label: "Commercial", type: "text" },
    { key: "demarrageProjet", label: "Démarrage du projet", type: "date" },
    { key: "nomChefProjet", label: "Nom chef de projet", type: "text" },
    { key: "prenomChefProjet", label: "Prénom chef de projet", type: "text" },
    {
      key: "estBoutiqueEnLigne",
      label: "Est Boutique En Ligne",
      type: "checkbox",
      trueLabel: "Oui",
      falseLabel: "Non",
    },
    { key: "status", label: "Statut", type: "text" },
    { key: "clientName", label: "Client", type: "text" },
    {
      key: "createdAt",
      label: "Date de Création",
      type: "date",
    },
    { key: "nomClient", label: "Nom Client" },
    { key: "contactsClient", label: "Contacts Client" },
    { key: "dateMiseEnLigne", label: "Date Mise En Ligne", type: "date" },
    {
      key: "dateCommercialisation",
      label: "Date Commercialisation",
      type: "date",
    },
    {
      key: "dateSortieOfficielle",
      label: "Date Sortie Officielle",
      type: "date",
    },
    {
      key: "precommande",
      label: "Precommande",
      type: "checkbox",
      trueLabel: "Oui",
      falseLabel: "Non",
    },
    {
      key: "dedicaceEnvisagee",
      label: "Dedicace Envisagee",
      type: "checkbox",
      trueLabel: "Oui",
      falseLabel: "Non",
    },
    {
      key: "typeAbonnementShopify",
      label: "Type Abonnement Shopify",
      type: "select",
      options: ["aucun", "mensuel", "annuel"],
    },
    {
      key: "snaResponsableDesign",
      label: "Sna Responsable Design",
      type: "checkbox",
      trueLabel: "Oui",
      falseLabel: "Non",
    },
    {
      key: "moduleDelivengo",
      label: "Module Delivengo",
      type: "checkbox",
      trueLabel: "Oui",
      falseLabel: "Non",
    },
    {
      key: "moduleMondialRelay",
      label: "Module Mondial Relay",
      type: "checkbox",
      trueLabel: "Oui",
      falseLabel: "Non",
    },
  ].filter(
    (field) =>
      // Exclude the specified fields
      !["shopifyCreatedAt", "documented", "compteClientRef"].includes(field.key)
  );

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center mb-4">
        {shop.logoUrl && (
          <img
            src={shop.logoUrl}
            alt="Logo"
            className="h-12 w-12 rounded-full mr-3 object-cover"
          />
        )}
        <h2 className="text-xl font-bold">{shop.nomProjet || shop.name}</h2>
      </div>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleDelete}
        shopName={shop?.nomProjet || shop?.name || ""}
      />

      {/* Shop Images */}
      {(shop.logoUrl || shop.desktopBannerUrl || shop.mobileBannerUrl) && (
        <div className="space-y-3 border-b border-gray-200 pb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            Images de la boutique
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {shop.logoUrl && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Logo</h4>
                <img
                  src={shop.logoUrl}
                  alt="Logo de la boutique"
                  className="h-20 w-20 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                  onClick={() => window.open(shop.logoUrl, "_blank")}
                />
              </div>
            )}
            {shop.desktopBannerUrl && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Bannière Desktop
                </h4>
                <img
                  src={shop.desktopBannerUrl}
                  alt="Bannière desktop"
                  className="h-20 w-40 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                  onClick={() => window.open(shop.desktopBannerUrl, "_blank")}
                />
              </div>
            )}
            {shop.mobileBannerUrl && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Bannière Mobile
                </h4>
                <img
                  src={shop.mobileBannerUrl}
                  alt="Bannière mobile"
                  className="h-20 w-32 object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                  onClick={() => window.open(shop.mobileBannerUrl, "_blank")}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {displayFields.map((field) => (
        <div key={field.key} className="flex items-center gap-2">
          <span className="font-medium w-48">{field.label}:</span>

          {editingField === field.key ? (
            <div className="flex items-center gap-2 flex-1">
              {field.type === "checkbox" ? (
                <select
                  className="px-3 py-1 border rounded flex-1"
                  value={fieldValues[field.key] ? "true" : "false"}
                  onChange={(e) =>
                    handleChange(field, e.target.value === "true")
                  }
                >
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                </select>
              ) : field.type === "select" ? (
                <select
                  className="px-3 py-1 border rounded flex-1"
                  value={fieldValues[field.key] || ""}
                  onChange={(e) => handleChange(field, e.target.value)}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="px-3 py-1 border rounded flex-1"
                  type={field.type === "date" ? "date" : "text"}
                  value={fieldValues[field.key] || ""}
                  onChange={(e) => handleChange(field, e.target.value)}
                />
              )}
              <button
                className="p-1 text-green-600 hover:text-green-800"
                onClick={() => handleSave(field)}
              >
                <FaSave />
              </button>
              <button
                className="p-1 text-red-600 hover:text-red-800"
                onClick={handleCancel}
              >
                <FaTimes />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <span className="px-3 py-1 bg-gray-100 rounded flex-1">
                {getFieldValue(field)}
              </span>
              <button
                className="p-1 text-blue-600 hover:text-blue-800"
                onClick={() => handleEdit(field)}
              >
                <FaEdit />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ShopDetails;
