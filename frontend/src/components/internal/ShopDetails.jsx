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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [replacingImage, setReplacingImage] = useState(null);

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

  // Image management functions
  const handleDownloadImage = async (imageUrl, imageType) => {
    try {
      console.log(
        `🔽 [SHOP IMAGE DOWNLOAD] Downloading ${imageType}:`,
        imageUrl
      );

      // Extract S3 key from URL for the proxy endpoint
      let imageKey;
      try {
        const urlObj = new URL(imageUrl);
        imageKey = decodeURIComponent(urlObj.pathname.substring(1));
      } catch (e) {
        imageKey = imageUrl;
      }

      const response = await fetch(
        `/api/internal/image-proxy?imageKey=${encodeURIComponent(imageKey)}`
      );

      if (!response.ok) {
        throw new Error("Failed to download image");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${shop.nomProjet || "shop"}_${imageType}_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log(
        `✅ [SHOP IMAGE DOWNLOAD] Successfully downloaded ${imageType}`
      );
    } catch (error) {
      console.error(
        `❌ [SHOP IMAGE DOWNLOAD] Error downloading ${imageType}:`,
        error
      );
      setError(`Erreur lors du téléchargement de l'image: ${error.message}`);
    }
  };

  const handleReplaceImage = (imageType) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        handleImageReplace(imageType, file);
      }
      setReplacingImage(null);
    };
    setReplacingImage(imageType);
    input.click();
  };

  const handleImageReplace = async (imageType, file) => {
    try {
      setUploadingImage(true);
      console.log(`🔄 [SHOP IMAGE REPLACE] Starting ${imageType} replacement`);

      console.log("📁 [SHOP DEBUG] File details:", {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        imageType: imageType,
      });

      console.log("🎯 [SHOP DEBUG] Request details:", {
        clientId,
        shopId,
        imageType,
      });

      // Step 1: Upload new image
      const formData = new FormData();
      formData.append("image", file);
      formData.append("imageType", imageType);

      // Debug FormData contents
      console.log("📦 [SHOP DEBUG] FormData contents:");
      for (let [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(
            `  ${key}: File(${value.name}, ${value.type}, ${value.size} bytes)`
          );
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }

      const uploadUrl = `/api/internal/shops/${clientId}/${shopId}/images/upload`;
      console.log("🌐 [SHOP DEBUG] Upload URL:", uploadUrl);
      console.log(`📤 [SHOP IMAGE REPLACE] Uploading new ${imageType}...`);

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        credentials: "include", // Required for session authentication
      });

      console.log(
        "📥 [SHOP DEBUG] Upload response status:",
        uploadResponse.status
      );
      console.log(
        "📥 [SHOP DEBUG] Upload response headers:",
        Object.fromEntries(uploadResponse.headers.entries())
      );

      if (!uploadResponse.ok) {
        console.log("❌ [SHOP DEBUG] Upload failed, response text:");
        const responseText = await uploadResponse.text();
        console.log("📄 [SHOP DEBUG] Raw response:", responseText);

        let errorData;
        try {
          errorData = JSON.parse(responseText);
          console.log("📊 [SHOP DEBUG] Parsed error data:", errorData);
        } catch (parseError) {
          console.log(
            "⚠️ [SHOP DEBUG] Failed to parse error response as JSON:",
            parseError
          );
          throw new Error(`File upload error: ${responseText}`);
        }

        throw new Error(
          errorData.message || `Failed to upload new ${imageType}`
        );
      }

      const uploadResult = await uploadResponse.json();
      console.log(
        `✅ [SHOP IMAGE REPLACE] New ${imageType} uploaded:`,
        uploadResult.imageUrl
      );

      // Step 2: Update the shop data in the database
      const oldImageUrl = shop[`${imageType}Url`];
      const updateResponse = await fetch(
        `/api/internal/shops/${clientId}/${shopId}/images/replace`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageType: imageType,
            newImageUrl: uploadResult.imageUrl,
            oldImageUrl: oldImageUrl,
          }),
          credentials: "include",
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(errorData.message || `Failed to replace ${imageType}`);
      }

      const updateResult = await updateResponse.json();
      console.log(`✅ [SHOP IMAGE REPLACE] ${imageType} replaced successfully`);

      // Step 3: Update local state
      setShop((prevShop) => ({
        ...prevShop,
        [`${imageType}Url`]: uploadResult.imageUrl,
      }));

      setError(null);
      console.log(
        `🎉 [SHOP IMAGE REPLACE] ${imageType} replacement completed successfully`
      );
    } catch (error) {
      console.error(
        `❌ [SHOP IMAGE REPLACE] Error replacing ${imageType}:`,
        error
      );
      setError(`Erreur lors du remplacement de l'image: ${error.message}`);
    } finally {
      setUploadingImage(false);
      setReplacingImage(null);
    }
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

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-4">
          <strong className="font-bold">Erreur: </strong>
          <span className="block sm:inline">{error}</span>
          <button
            onClick={() => setError(null)}
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
          >
            <svg
              className="fill-current h-6 w-6 text-red-500"
              role="button"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
            >
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
            </svg>
          </button>
        </div>
      )}

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
              <div className="relative group">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Logo</h4>
                <div className="relative h-20 w-20">
                  <img
                    src={shop.logoUrl}
                    alt="Logo de la boutique"
                    className="h-full w-full object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                    onClick={() => window.open(shop.logoUrl, "_blank")}
                  />

                  {/* Action buttons overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center rounded-lg overflow-hidden">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
                      {/* Download button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadImage(shop.logoUrl, "logo");
                        }}
                        className="bg-white text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors"
                        title="Télécharger le logo"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </button>

                      {/* Replace button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplaceImage("logo");
                        }}
                        className="bg-white text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors"
                        title="Remplacer le logo"
                        disabled={uploadingImage && replacingImage === "logo"}
                      >
                        {uploadingImage && replacingImage === "logo" ? (
                          <div className="animate-spin w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                        ) : (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {shop.desktopBannerUrl && (
              <div className="relative group">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Bannière Desktop
                </h4>
                <div className="relative h-20 w-40">
                  <img
                    src={shop.desktopBannerUrl}
                    alt="Bannière desktop"
                    className="h-full w-full object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                    onClick={() => window.open(shop.desktopBannerUrl, "_blank")}
                  />

                  {/* Action buttons overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center rounded-lg overflow-hidden">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
                      {/* Download button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadImage(
                            shop.desktopBannerUrl,
                            "desktopBanner"
                          );
                        }}
                        className="bg-white text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors"
                        title="Télécharger la bannière desktop"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </button>

                      {/* Replace button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplaceImage("desktopBanner");
                        }}
                        className="bg-white text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors"
                        title="Remplacer la bannière desktop"
                        disabled={
                          uploadingImage && replacingImage === "desktopBanner"
                        }
                      >
                        {uploadingImage &&
                        replacingImage === "desktopBanner" ? (
                          <div className="animate-spin w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                        ) : (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {shop.mobileBannerUrl && (
              <div className="relative group">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Bannière Mobile
                </h4>
                <div className="relative h-20 w-32">
                  <img
                    src={shop.mobileBannerUrl}
                    alt="Bannière mobile"
                    className="h-full w-full object-cover rounded-lg border cursor-pointer transition-transform hover:scale-105"
                    onClick={() => window.open(shop.mobileBannerUrl, "_blank")}
                  />

                  {/* Action buttons overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 flex items-center justify-center rounded-lg overflow-hidden">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
                      {/* Download button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadImage(
                            shop.mobileBannerUrl,
                            "mobileBanner"
                          );
                        }}
                        className="bg-white text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors"
                        title="Télécharger la bannière mobile"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </button>

                      {/* Replace button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplaceImage("mobileBanner");
                        }}
                        className="bg-white text-gray-800 p-1.5 rounded hover:bg-gray-100 transition-colors"
                        title="Remplacer la bannière mobile"
                        disabled={
                          uploadingImage && replacingImage === "mobileBanner"
                        }
                      >
                        {uploadingImage && replacingImage === "mobileBanner" ? (
                          <div className="animate-spin w-3 h-3 border-2 border-gray-600 border-t-transparent rounded-full"></div>
                        ) : (
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
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
