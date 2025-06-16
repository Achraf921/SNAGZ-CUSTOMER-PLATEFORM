import React, { useState, useEffect } from "react";

const DocumentationSection = () => {
  const [shops, setShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const response = await fetch("/api/customer/all?details=true");
        if (!response.ok)
          throw new Error("Erreur lors du chargement des boutiques");
        const data = await response.json();

        // Filter and transform shops data
        const processedShops = (data.customers || []).reduce(
          (acc, customer) => {
            // Only process active customers
            if (customer.status === "active" && Array.isArray(customer.shops)) {
              // Filter for valid shops only
              const validShops = customer.shops
                .filter((shop) => shop.status === "valid")
                .map((shop) => ({
                  ...shop,
                  customerName: customer.raisonSociale,
                  customerId: customer._id,
                  customerStatus: customer.status,
                }));
              return [...acc, ...validShops];
            }
            return acc;
          },
          []
        );

        setShops(processedShops);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchShops();
  }, []);

  const handleDocumentationAction = async (shopId, action) => {
    try {
      const response = await fetch(
        `/api/customer/shop/${shopId}/documentation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      if (!response.ok)
        throw new Error("Erreur lors de la mise à jour de la documentation");

      // Update local state
      setShops((prevShops) =>
        prevShops.map((shop) =>
          shop.shopId === shopId
            ? {
                ...shop,
                documented:
                  action === "document" || action === "mark_documented"
                    ? "documented"
                    : "undocumented",
              }
            : shop
        )
      );

      // Show success message
      setNotification({
        type: "success",
        message:
          action === "document" || action === "mark_documented"
            ? "La documentation a été générée avec succès"
            : "La documentation a été supprimée avec succès",
      });
    } catch (err) {
      setNotification({
        type: "error",
        message: "Erreur: " + err.message,
      });
    }
  };

  const handleActionConfirmation = (shopId, action) => {
    let message = "";
    switch (action) {
      case "mark_documented":
        message =
          "Êtes-vous sûr de vouloir marquer cette boutique comme déjà documentée ?";
        break;
      case "document":
        message =
          "Êtes-vous sûr de vouloir générer la documentation SharePoint pour cette boutique ?";
        break;
      case "undocument":
        message =
          "Êtes-vous sûr de vouloir supprimer la documentation de cette boutique ?";
        break;
      default:
        return;
    }

    setNotification({
      type: "confirmation",
      message,
      onConfirm: () => {
        handleDocumentationAction(shopId, action);
        setNotification(null);
      },
      onCancel: () => setNotification(null),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sna-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Erreur</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Notification Modal */}
      {notification && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center">
              {notification.type === "confirmation" ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Confirmation
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">
                    {notification.message}
                  </p>
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={notification.onCancel}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={notification.onConfirm}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Confirmer
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
                      notification.type === "success"
                        ? "bg-green-100"
                        : "bg-red-100"
                    }`}
                  >
                    {notification.type === "success" ? (
                      <svg
                        className="h-6 w-6 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-6 w-6 text-red-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">
                    {notification.type === "success" ? "Succès" : "Erreur"}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    {notification.message}
                  </p>
                  <div className="mt-6">
                    <button
                      onClick={() => setNotification(null)}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      Fermer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Générer la documentation
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Seules les boutiques validées des clients actifs peuvent être
          documentées.
        </p>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {shops.map((shop) => (
            <li key={shop.shopId} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-sna-primary truncate">
                      {shop.nomProjet}
                    </p>
                    <div className="ml-2 flex-shrink-0 flex">
                      <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Boutique validée
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <div className="sm:flex">
                      <p className="flex items-center text-sm text-gray-500">
                        Client: {shop.customerName}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                      <p>
                        Statut documentation:{" "}
                        <span
                          className={`font-medium ${
                            shop.documented === "documented"
                              ? "text-green-600"
                              : "text-yellow-600"
                          }`}
                        >
                          {shop.documented === "documented"
                            ? "Documentée"
                            : "Non documentée"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0 flex space-x-4">
                  {shop.documented === "undocumented" ? (
                    <>
                      <button
                        onClick={() =>
                          handleActionConfirmation(
                            shop.shopId,
                            "mark_documented"
                          )
                        }
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                      >
                        Boutique déjà documentée
                      </button>
                      <button
                        onClick={() =>
                          handleActionConfirmation(shop.shopId, "document")
                        }
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                      >
                        Générer documentation SharePoint
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() =>
                        handleActionConfirmation(shop.shopId, "undocument")
                      }
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      Supprimer documentation
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default DocumentationSection;
