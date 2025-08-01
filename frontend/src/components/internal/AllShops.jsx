import React, { useState, useEffect } from "react";
import ShopDetails from "./ShopDetails"; // Assuming ShopDetails is in the same directory
import {
  FaUpload,
  FaPlus,
  FaTrash,
  FaExclamationTriangle,
} from "react-icons/fa";

const AllShops = () => {
  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState({});
  const [uploadingImage, setUploadingImage] = useState(null); // Changed from uploadingLogo to uploadingImage
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [shopToDelete, setShopToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Function to handle image upload for any image type
  const handleImageUpload = (shopId, imageType) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        // Check file size (50MB limit)
        const maxSize = 50 * 1024 * 1024; // 50MB in bytes
        if (file.size > maxSize) {
          setError(
            `Le fichier est trop volumineux. Taille maximale autorisée: 50MB. Taille du fichier: ${(file.size / 1024 / 1024).toFixed(2)}MB`
          );
          return;
        }

        // Check file type
        if (!file.type.startsWith("image/")) {
          setError("Veuillez sélectionner un fichier image valide.");
          return;
        }

        await uploadShopImage(shopId, file, imageType);
      }
    };
    input.click();
  };

  // Function to upload shop image
  const uploadShopImage = async (shopId, file, imageType) => {
    try {
      setUploadingImage(`${shopId}-${imageType}`);

      const shop = shops.find((s) => s.id === shopId);
      if (!shop) {
        throw new Error("Shop not found");
      }

      const formData = new FormData();
      formData.append("image", file);
      formData.append("imageType", imageType);

      const response = await fetch(
        `/api/internal/shops/${shop.clientId}/${shopId}/images/upload`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload image");
      }

      const result = await response.json();

      console.log(`${imageType} uploaded successfully:`, result);

      // CRITICAL: Call replace endpoint to save to database
      console.log(`🔄 [ALL SHOPS] Calling replace endpoint for ${imageType}`);

      const oldImageUrl = shop[`${imageType}Url`];
      const replaceUrl = `/api/internal/shops/${shop.clientId}/${shopId}/images/replace`;

      console.log(`📞 [ALL SHOPS] Replace call:`, {
        replaceUrl,
        imageType,
        newImageUrl: result.imageUrl,
        oldImageUrl,
      });

      const replaceResponse = await fetch(replaceUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageType: imageType,
          newImageUrl: result.imageUrl,
          oldImageUrl: oldImageUrl,
        }),
        credentials: "include",
      });

      if (!replaceResponse.ok) {
        const errorText = await replaceResponse.text();
        console.error(`❌ [ALL SHOPS] Replace failed:`, errorText);
        throw new Error(
          `Failed to save ${imageType} to database: ${errorText}`
        );
      }

      const replaceResult = await replaceResponse.json();
      console.log(
        `✅ [ALL SHOPS] ${imageType} saved to database:`,
        replaceResult
      );

      // Update the shop in the state with the new image URL
      setShops((prevShops) =>
        prevShops.map((s) =>
          s.id === shopId
            ? {
                ...s,
                [`${imageType}Url`]: result.imageUrl,
                [`${imageType}S3Key`]: result.s3Key,
                // Also update alternative field names if they exist
                ...(imageType === "desktopBanner" && {
                  bannerUrl: result.imageUrl,
                }),
                ...(imageType === "mobileBanner" && {
                  mobileBannerUrl: result.imageUrl,
                }),
              }
            : s
        )
      );

      setError(null); // Clear any previous errors
      console.log(
        `🎉 [ALL SHOPS] ${imageType} upload and save completed successfully!`
      );
    } catch (error) {
      console.error(`Error uploading ${imageType}:`, error);

      // Provide specific error messages based on the error type
      let errorMessage = `Erreur lors du téléchargement de ${imageType}: `;

      if (error.message.includes("File size too large")) {
        errorMessage +=
          "Le fichier est trop volumineux (limite: 50MB). Veuillez réduire la taille de l'image.";
      } else if (error.message.includes("Invalid file type")) {
        errorMessage +=
          "Type de fichier non valide. Veuillez sélectionner une image.";
      } else if (error.message.includes("Failed to fetch")) {
        errorMessage +=
          "Problème de connexion. Veuillez vérifier votre connexion internet et réessayer.";
      } else {
        errorMessage += error.message;
      }

      setError(errorMessage);
    } finally {
      setUploadingImage(null);
    }
  };

  useEffect(() => {
    // Fetch all shops data from backend
    const fetchAllShops = async () => {
      try {
        const response = await fetch("/api/internal/all-shops");
        if (!response.ok)
          throw new Error("Erreur lors du chargement des boutiques");
        const data = await response.json();
        // Expecting data.shops to be an array of shops with client info
        setShops(
          (data.shops || []).map((shop) => ({
            id: shop.shopId,
            name: shop.nomProjet || shop.name || "-",
            clientName: shop.clientName,
            clientId: shop.clientId,
            productsCount: shop.productsCount,
            status: shop.status,
            hasShopify: shop.hasShopify,
            documented: shop.documented,
            logoUrl: shop.logoUrl,
            desktopBannerUrl: shop.desktopBannerUrl || shop.bannerUrl, // fallback to bannerUrl
            mobileBannerUrl: shop.mobileBannerUrl,
            faviconUrl: shop.faviconUrl,
          }))
        );
      } catch (err) {
        setError(err.message);
      }
      setIsLoading(false);
    };
    fetchAllShops();
  }, []);

  const filteredShops = shops.filter(
    (shop) =>
      shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shop.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleRow = (shopId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [shopId]: !prev[shopId],
    }));
  };

  const handleShopDelete = (deletedShopId) => {
    setShops((prevShops) =>
      prevShops.filter((shop) => shop.id !== deletedShopId)
    );
  };

  // Function to initiate delete shop process
  const initiateDeleteShop = (shop) => {
    console.log("🗑️ [FRONTEND] Initiating delete for shop:", shop.name);
    setShopToDelete(shop);
    setShowDeleteModal(true);
  };

  // Function to confirm and execute shop deletion
  const confirmDeleteShop = async () => {
    if (!shopToDelete) return;

    console.log("🗑️ [FRONTEND] Confirming delete for shop:", shopToDelete.name);
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/internal/clients/${shopToDelete.clientId}/shops/${shopToDelete.id}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Erreur lors de la suppression de la boutique"
        );
      }

      console.log("✅ [FRONTEND] Shop deleted successfully:", result);

      // Show success message with details
      const successMessage = `Boutique "${shopToDelete.name}" supprimée avec succès. ${
        result.details?.imagesDeleted
          ? `${result.details.imagesDeleted} image(s) supprimée(s) de S3.`
          : ""
      }`;

      setError(null);

      // Remove shop from local state
      handleShopDelete(shopToDelete.id);

      // Show success message briefly
      setError({ type: "success", message: successMessage });
      setTimeout(() => setError(null), 5000);
    } catch (error) {
      console.error("❌ [FRONTEND] Error deleting shop:", error);
      setError({ type: "error", message: error.message });
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setShopToDelete(null);
    }
  };

  // Function to cancel shop deletion
  const cancelDeleteShop = () => {
    console.log("❌ [FRONTEND] Cancelled delete for shop:", shopToDelete?.name);
    setShowDeleteModal(false);
    setShopToDelete(null);
  };

  if (isLoading) return <p>Chargement de toutes les boutiques...</p>;
  if (error && typeof error === "string")
    return <p className="text-red-500">Erreur: {error}</p>;

  return (
    <div className="w-full p-4">
      {error && (
        <div
          className={`mb-4 p-3 border rounded ${
            error.type === "success"
              ? "bg-green-100 border-green-400 text-green-700"
              : "bg-red-100 border-red-400 text-red-700"
          }`}
        >
          {error.message || error}
          <button
            onClick={() => setError(null)}
            className={`ml-2 hover:opacity-70 ${
              error.type === "success" ? "text-green-900" : "text-red-900"
            }`}
          >
            ×
          </button>
        </div>
      )}
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">
          Toutes les Boutiques
        </h1>
        <input
          type="text"
          placeholder="Rechercher une boutique ou un client..."
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredShops.length === 0 ? (
        <p>Aucune boutique trouvée.</p>
      ) : (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Nom Boutique
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Nom Client
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Statut
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Documenté
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Shopify
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredShops.map((shop) => (
                <React.Fragment key={shop.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center">
                        {shop.logoUrl ? (
                          <img
                            src={shop.logoUrl}
                            alt="Logo"
                            className="h-8 w-8 rounded-full mr-3 object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full mr-3 bg-gray-200 flex items-center justify-center relative group">
                            {uploadingImage &&
                            uploadingImage.startsWith(`${shop.id}-logo`) ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                            ) : (
                              <>
                                <span className="text-gray-400 text-xs">
                                  N/A
                                </span>
                                <button
                                  onClick={() =>
                                    handleImageUpload(shop.id, "logo")
                                  }
                                  className="absolute inset-0 flex items-center justify-center bg-blue-500 bg-opacity-0 hover:bg-opacity-80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                  title="Ajouter un logo"
                                >
                                  <FaPlus className="text-white text-xs" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        <span>{shop.name || "-"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shop.clientName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
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
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          shop.documented === "documented"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {shop.documented === "documented" ? "Oui" : "Non"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          shop.hasShopify
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {shop.hasShopify ? "Oui" : "Non"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => toggleRow(shop.id)}
                          className="text-sna-primary hover:underline"
                        >
                          {expandedRows[shop.id] ? "Masquer" : "Voir Détails"}
                        </button>
                        <button
                          onClick={() => initiateDeleteShop(shop)}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Supprimer la boutique"
                        >
                          <FaTrash className="text-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedRows[shop.id] && (
                    <tr>
                      <td colSpan="6" className="px-6 py-4 bg-gray-50">
                        <div className="space-y-4">
                          {/* Image Management Section */}
                          <div className="bg-white p-4 rounded-lg border">
                            <h4 className="text-lg font-medium text-gray-900 mb-4">
                              Gestion des Images
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {/* Logo */}
                              <div className="text-center">
                                <h5 className="text-sm font-medium text-gray-700 mb-2">
                                  Logo
                                </h5>
                                <div className="w-24 h-24 mx-auto border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                                  {shop.logoUrl ? (
                                    <img
                                      src={shop.logoUrl}
                                      alt="Logo"
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                  ) : (
                                    <div className="text-center">
                                      {uploadingImage &&
                                      uploadingImage.startsWith(
                                        `${shop.id}-logo`
                                      ) ? (
                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mx-auto"></div>
                                      ) : (
                                        <button
                                          onClick={() =>
                                            handleImageUpload(shop.id, "logo")
                                          }
                                          className="text-gray-400 hover:text-blue-500 transition-colors"
                                          title="Ajouter un logo"
                                        >
                                          <FaPlus className="text-2xl" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  Logo
                                </p>
                              </div>

                              {/* Desktop Banner */}
                              <div className="text-center">
                                <h5 className="text-sm font-medium text-gray-700 mb-2">
                                  Banner Desktop
                                </h5>
                                <div className="w-24 h-12 mx-auto border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                                  {shop.desktopBannerUrl ? (
                                    <img
                                      src={shop.desktopBannerUrl}
                                      alt="Desktop Banner"
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                  ) : (
                                    <div className="text-center">
                                      {uploadingImage &&
                                      uploadingImage.startsWith(
                                        `${shop.id}-desktopBanner`
                                      ) ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mx-auto"></div>
                                      ) : (
                                        <button
                                          onClick={() =>
                                            handleImageUpload(
                                              shop.id,
                                              "desktopBanner"
                                            )
                                          }
                                          className="text-gray-400 hover:text-blue-500 transition-colors"
                                          title="Ajouter un banner desktop"
                                        >
                                          <FaPlus className="text-lg" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  Banner Desktop
                                </p>
                              </div>

                              {/* Mobile Banner */}
                              <div className="text-center">
                                <h5 className="text-sm font-medium text-gray-700 mb-2">
                                  Banner Mobile
                                </h5>
                                <div className="w-16 h-24 mx-auto border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                                  {shop.mobileBannerUrl ? (
                                    <img
                                      src={shop.mobileBannerUrl}
                                      alt="Mobile Banner"
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                  ) : (
                                    <div className="text-center">
                                      {uploadingImage &&
                                      uploadingImage.startsWith(
                                        `${shop.id}-mobileBanner`
                                      ) ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mx-auto"></div>
                                      ) : (
                                        <button
                                          onClick={() =>
                                            handleImageUpload(
                                              shop.id,
                                              "mobileBanner"
                                            )
                                          }
                                          className="text-gray-400 hover:text-blue-500 transition-colors"
                                          title="Ajouter un banner mobile"
                                        >
                                          <FaPlus className="text-lg" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  Banner Mobile
                                </p>
                              </div>

                              {/* Favicon */}
                              <div className="text-center">
                                <h5 className="text-sm font-medium text-gray-700 mb-2">
                                  Favicon
                                </h5>
                                <div className="w-16 h-16 mx-auto border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                                  {shop.faviconUrl ? (
                                    <img
                                      src={shop.faviconUrl}
                                      alt="Favicon"
                                      className="w-full h-full object-cover rounded-lg"
                                    />
                                  ) : (
                                    <div className="text-center">
                                      {uploadingImage &&
                                      uploadingImage.startsWith(
                                        `${shop.id}-favicon`
                                      ) ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mx-auto"></div>
                                      ) : (
                                        <button
                                          onClick={() =>
                                            handleImageUpload(
                                              shop.id,
                                              "favicon"
                                            )
                                          }
                                          className="text-gray-400 hover:text-blue-500 transition-colors"
                                          title="Ajouter un favicon"
                                        >
                                          <FaPlus className="text-lg" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  Favicon
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Shop Details */}
                          <ShopDetails
                            clientId={shop.clientId}
                            shopId={shop.id}
                            onDelete={handleShopDelete}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <FaExclamationTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                Supprimer la boutique
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Êtes-vous sûr de vouloir supprimer la boutique{" "}
                  <strong>"{shopToDelete?.name || "Sans nom"}"</strong> de{" "}
                  <strong>{shopToDelete?.clientName}</strong> ?
                </p>
                <p className="text-sm text-red-600 mt-2 font-medium">
                  ⚠️ Cette action est irréversible et supprimera également
                  toutes les images associées du serveur S3.
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <div className="flex space-x-3">
                  <button
                    onClick={cancelDeleteShop}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={confirmDeleteShop}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50 flex items-center justify-center"
                  >
                    {isDeleting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Suppression...
                      </>
                    ) : (
                      "Supprimer"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllShops;
