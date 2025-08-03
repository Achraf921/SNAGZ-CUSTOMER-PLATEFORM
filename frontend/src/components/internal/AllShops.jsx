import React, { useState, useEffect } from "react";
import ShopDetails from "./ShopDetails"; // Assuming ShopDetails is in the same directory
import { FaUpload, FaPlus } from "react-icons/fa";

const AllShops = () => {
  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedRows, setExpandedRows] = useState({});
  const [uploadingImage, setUploadingImage] = useState(null); // Changed from uploadingLogo to uploadingImage

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
        `/api/internal/upload/shops/${shop.clientId}/${shopId}/images/upload`,
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
            logoS3Key: shop.logoS3Key,
            desktopBannerUrl: shop.desktopBannerUrl || shop.bannerUrl, // fallback to bannerUrl
            desktopBannerS3Key: shop.desktopBannerS3Key,
            mobileBannerUrl: shop.mobileBannerUrl,
            mobileBannerS3Key: shop.mobileBannerS3Key,
            faviconUrl: shop.faviconUrl,
            faviconS3Key: shop.faviconS3Key,
          }))
        );
      } catch (err) {
        setError(err.message);
      }
      setIsLoading(false);
    };
    fetchAllShops();
  }, []);

  const getImageSrc = (url, s3Key) => {
    // Priority 1: If the URL is a data URI, use it directly.
    if (url && url.startsWith("data:image")) {
      return url;
    }
    // Priority 2: If there's a valid S3 key, use the proxy.
    if (s3Key) {
      return `/api/internal/image-proxy?imageKey=${encodeURIComponent(s3Key)}`;
    }
    // Priority 3: If the URL is a full, valid HTTPS URL, use it directly.
    if (url && url.startsWith("http")) {
      return url;
    }
    // Fallback: If we only have a URL that isn't a data URI or HTTPS (i.e., it might be a key), proxy it.
    if (url) {
      return `/api/internal/image-proxy?imageKey=${encodeURIComponent(url)}`;
    }
    // If no valid source, return an empty string to avoid broken image icons.
    return "";
  };

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

  if (isLoading) return <p>Chargement de toutes les boutiques...</p>;
  if (error) return <p className="text-red-500">Erreur: {error}</p>;

  return (
    <div className="w-full p-4">
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-900 hover:text-red-700"
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
                        {getImageSrc(shop.logoUrl, shop.logoS3Key) ? (
                          <img
                            src={getImageSrc(shop.logoUrl, shop.logoS3Key)}
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
                      <button
                        onClick={() => toggleRow(shop.id)}
                        className="text-sna-primary hover:underline"
                      >
                        {expandedRows[shop.id] ? "Masquer" : "Voir Détails"}
                      </button>
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
                                  {getImageSrc(shop.logoUrl, shop.logoS3Key) ? (
                                    <img
                                      src={getImageSrc(
                                        shop.logoUrl,
                                        shop.logoS3Key
                                      )}
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
                                  {getImageSrc(
                                    shop.desktopBannerUrl,
                                    shop.desktopBannerS3Key
                                  ) ? (
                                    <img
                                      src={getImageSrc(
                                        shop.desktopBannerUrl,
                                        shop.desktopBannerS3Key
                                      )}
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
                                  {getImageSrc(
                                    shop.mobileBannerUrl,
                                    shop.mobileBannerS3Key
                                  ) ? (
                                    <img
                                      src={getImageSrc(
                                        shop.mobileBannerUrl,
                                        shop.mobileBannerS3Key
                                      )}
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
                                  {getImageSrc(
                                    shop.faviconUrl,
                                    shop.faviconS3Key
                                  ) ? (
                                    <img
                                      src={getImageSrc(
                                        shop.faviconUrl,
                                        shop.faviconS3Key
                                      )}
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
    </div>
  );
};

export default AllShops;
