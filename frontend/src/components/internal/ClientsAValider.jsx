import React, { useState, useEffect, useMemo, useCallback } from "react";
import { FaUser, FaCheckCircle, FaRegCheckCircle } from "react-icons/fa";

// New validation button with local loading state
function ValidateClientButton({
  clientId,
  allFieldsValidated,
  validatedCount,
  totalFields,
  onValidate,
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onValidate();
    } catch (err) {
      setError(err.message || "Erreur lors de la validation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={!allFieldsValidated || loading}
        className={`px-4 py-2 rounded ${
          allFieldsValidated && !loading
            ? "bg-green-500 hover:bg-green-600 text-white"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
        }`}
        title={
          !allFieldsValidated
            ? `Veuillez vérifier tous les champs (${totalFields} requis)`
            : loading
            ? "Validation en cours..."
            : "Cliquez pour valider le client"
        }
        type="button"
      >
        {loading
          ? "Validation en cours..."
          : `Valider le client (${validatedCount}/${totalFields} vérifiés)`}
      </button>
      {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
    </div>
  );
}

export default function ClientsAValider() {
  const [clients, setClients] = useState({
    pending: [],
    valid: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedClient, setExpandedClient] = useState(null);
  const [validatingClient, setValidatingClient] = useState(null);
  const [validationInProgress, setValidationInProgress] = useState(null);
  const [validatedFields, setValidatedFields] = useState({});
  const [clientToUnvalidate, setClientToUnvalidate] = useState(null);
  const [showUnvalidateConfirm, setShowUnvalidateConfirm] = useState(false);

  const validationFields = useMemo(
    () => [
      { key: "raisonSociale", label: "Raison Sociale" },
      { key: "formeJuridique", label: "Forme Juridique" },
      { key: "siret", label: "SIRET" },
      { key: "adresseSociete", label: "Adresse" },
      { key: "codePostalSociete", label: "Code Postal" },
      { key: "villeSociete", label: "Ville" },
      { key: "paysSociete", label: "Pays" },
      { key: "contact1Nom", label: "Contact Principal" },
      { key: "contact1Email", label: "Email Principal" },
      { key: "contact1Telephone", label: "Téléphone Principal" },
      { key: "contactFacturationNom", label: "Contact Facturation" },
      { key: "contactFacturationEmail", label: "Email Facturation" },
      { key: "contactFacturationTelephone", label: "Téléphone Facturation" },
      { key: "nomSoumission", label: "Soumis par" },
      { key: "fonctionSoumission", label: "Fonction" },
      { key: "dateSoumission", label: "Date de soumission" },
    ],
    []
  );

  // Initialize validation state when client data is loaded
  useEffect(() => {
    if (clients.pending.length > 0) {
      console.log(
        "Initializing validation state for clients:",
        clients.pending
      );
      setValidatedFields((prev) => {
        const newState = { ...prev };
        clients.pending.forEach((client) => {
          if (!newState[client._id]) {
            // Initialize with all fields set to false
            const clientFields = {};
            validationFields.forEach((fieldInfo) => {
              clientFields[fieldInfo.key] = false;
            });
            newState[client._id] = clientFields;
            console.log(
              `Initialized validation state for client ${client._id}:`,
              newState[client._id]
            );
          }
        });
        return newState;
      });
    }
  }, [clients.pending, validationFields]);

  const toggleFieldValidation = (clientId, fieldName) => {
    console.log(
      `Toggling validation for client ${clientId}, field: ${fieldName}`
    );
    setValidatedFields((prev) => {
      const currentClientState = { ...(prev[clientId] || {}) };
      const currentValue = currentClientState[fieldName] || false;
      const newValue = !currentValue;

      const updatedState = {
        ...prev,
        [clientId]: {
          ...currentClientState,
          [fieldName]: newValue,
        },
      };

      console.log(`Toggled ${fieldName} to ${newValue} for client ${clientId}`);
      console.log("Updated validation state:", updatedState[clientId]);

      // Log the current state of all fields for this client
      const allFieldsValid = validationFields.every(
        (fieldInfo) => updatedState[clientId]?.[fieldInfo.key] === true
      );
      console.log(`All fields valid after toggle: ${allFieldsValid}`);
      console.log(
        "Field states:",
        validationFields.map((fieldInfo) => ({
          field: fieldInfo.key,
          isValid: updatedState[clientId]?.[fieldInfo.key] === true,
        }))
      );

      return updatedState;
    });
  };

  const allFieldsValidated = (clientId) => {
    if (!clientId || !validatedFields[clientId]) {
      console.log(`No validation fields found for client ${clientId}`);
      return false;
    }

    const clientValidations = validatedFields[clientId];
    const allValid = validationFields.every(
      (fieldInfo) => clientValidations[fieldInfo.key] === true
    );

    console.log(`Validating client ${clientId}:`, {
      clientValidations,
      allValid,
      fieldStates: validationFields.map((fieldInfo) => ({
        field: fieldInfo.key,
        isValid: clientValidations[fieldInfo.key] === true,
        value: clientValidations[fieldInfo.key],
      })),
    });

    return allValid;
  };

  const toggleClientValidation = (client) => {
    const clientId = client?._id || client?.id;
    if (!clientId) {
      console.error("No client ID provided");
      return;
    }

    if (expandedClient === clientId) {
      // If clicking the same client, toggle the form
      setExpandedClient(null);
      setValidatingClient(null);
    } else {
      // If clicking a different client, show its form
      setExpandedClient(clientId);
      setValidatingClient(client);
    }
  };

  const validateClient = async () => {
    if (!validatingClient) {
      console.error("No client selected for validation");
      return;
    }

    const clientId = validatingClient._id || validatingClient.id;
    if (!clientId) {
      console.error("No client ID provided");
      return;
    }

    console.log("Starting validation for client:", clientId);
    console.log("Current validatingClient state:", validatingClient);

    try {
      setValidationInProgress(clientId);
      const idString = clientId.toString();

      console.log(`Validating client ${idString}...`);

      // Use the correct endpoint from the backend
      const response = await fetch(`/api/customer/clients/${idString}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          status: "active",
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      // Refresh the client list to ensure consistency
      const updatedClients = await fetchClients();
      console.log("Updated clients after validation:", updatedClients);

      // Reset states
      setExpandedClient(null);
      setValidatingClient(null);
      // Clear validation state for this client
      setValidatedFields((prev) => {
        const newState = { ...prev };
        delete newState[clientId];
        return newState;
      });

      console.log("Client validation completed successfully");
    } catch (error) {
      console.error("Error validating client:", error);
      setError(`Échec de la validation du client: ${error.message}`);
    } finally {
      setValidationInProgress(null);
    }
  };

  const unvalidateClient = async (client) => {
    const clientId = client?._id || client?.id;
    if (!clientId) {
      console.error("No client ID provided");
      return;
    }

    try {
      setValidationInProgress(clientId);
      const idString = clientId.toString();

      console.log(`Unvalidating client ${idString}...`);

      // Use the correct endpoint from the backend
      const response = await fetch(`/api/customer/clients/${idString}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          status: "inactive",
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      // Refresh the client list to ensure consistency
      await fetchClients();
      setShowUnvalidateConfirm(false);
      setValidationInProgress(null);
      return;
    } catch (error) {
      console.error("Error unvalidating client:", error);
      setError(`Échec de l'invalidation du client: ${error.message}`);
      setValidationInProgress(null);
    }
  };

  const confirmUnvalidate = (client) => {
    setClientToUnvalidate(client);
    setShowUnvalidateConfirm(true);
  };

  const cancelUnvalidate = () => {
    setShowUnvalidateConfirm(false);
    setClientToUnvalidate(null);
  };

  const toggleClient = (client) => {
    const isExpanding = expandedClient !== client._id;
    setExpandedClient(isExpanding ? client._id : null);
    setValidationInProgress(isExpanding ? client._id : null);

    if (isExpanding) {
      setValidatedFields((prev) => ({
        ...prev,
        [client._id]: prev[client._id] || {},
      }));
      fetchClientDetails(client);
    }
  };

  const fetchClientDetails = useCallback(
    async (clientOrId) => {
      let clientId;

      // Handle both client object and direct ID input
      if (typeof clientOrId === "object" && clientOrId !== null) {
        clientId = clientOrId._id || clientOrId.id;
        if (!clientId) {
          console.error(
            "No valid client ID found in client object:",
            clientOrId
          );
          setError("Invalid client data: Missing client ID");
          return null;
        }
      } else {
        clientId = clientOrId;
      }
      const idString = clientId.toString().trim();
      try {
        console.log(`Fetching details for client ID: ${idString}`);
        const response = await fetch(`/api/customer/${idString}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error response for client ${idString}:`, errorText);
          return null;
        }

        const responseData = await response.json();
        console.log("Raw client details response:", responseData);

        // Try different response formats
        const detailedClient =
          responseData.customer || responseData.data || responseData;

        if (!detailedClient) {
          throw new Error("No client data received from server");
        }

        return detailedClient;
      } catch (error) {
        console.error(`Error fetching details for client ${idString}:`, error);
        return null;
      }
    },
    [setError]
  );

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("Fetching clients from /api/customer/all...");

      // First, get the list of clients
      const response = await fetch("/api/customer/all", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error Response:", errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Fetched clients raw data:", data);

      // Process the initial client list
      const initialClients = data.customers || [];
      console.log("Initial client list:", initialClients);

      // Fetch full details for each client in parallel
      const clientsWithDetails = await Promise.all(
        initialClients.map(async (client) => {
          const clientId = client._id || client.id;
          if (!clientId) return null;

          try {
            const fullDetails = await fetchClientDetails(clientId);
            if (!fullDetails) {
              console.error(`No details returned for client ${clientId}`);
              return null;
            }
            return {
              ...client,
              ...fullDetails, // This will include the status field
              id: clientId,
              name: fullDetails.raisonSociale || client.raisonSociale || "Sans nom",
              email: fullDetails.contact1Email || fullDetails.email || client.email || "Non spécifié",
              shops: Array.isArray(client.shops) ? client.shops : [],
              shopsCount: Array.isArray(client.shops) ? client.shops.length : 0,
            };
          } catch (error) {
            console.error(`Error processing client ${clientId}:`, error);
            return null;
          }
        })
      );

      // Filter out any null values from failed fetches
      const validClients = clientsWithDetails.filter(Boolean);
      console.log("Clients with full details:", validClients);

      // Categorize clients based on status
      const clientsValides = validClients.filter(
        (client) => client.status === "active"
      );
      const clientsEnAttente = validClients.filter(
        (client) => client.status !== "active"
      );

      setClients({
        pending: clientsEnAttente,
        valid: clientsValides,
      });
    } catch (err) {
      console.error("Error fetching clients:", err);
      setError(
        err.message || "Une erreur est survenue lors du chargement des clients"
      );
    } finally {
      setIsLoading(false);
    }
  }, [fetchClientDetails]);

  // fetchClientDetails is now defined above and handles both client objects and direct IDs

  useEffect(() => {
    let isMounted = true;

    if (isMounted) {
      fetchClients();
    }

    return () => {
      isMounted = false;
    };
  }, [fetchClients]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          Clients à Valider
        </h1>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          Clients à Valider
        </h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        Clients à Valider
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">
            Clients en attente ({clients.pending.length})
          </h2>
          {clients.pending.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">Aucun client en attente</p>
            </div>
          ) : (
            clients.pending.map((client) => (
              <div
                key={client._id}
                className="bg-white rounded-lg shadow overflow-hidden"
              >
                <div
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleClient(client)}
                >
                  <div>
                    <h3 className="font-semibold text-lg flex items-center">
                      <FaUser className="mr-2 text-blue-700" />
                      {client.raisonSociale || client.name}
                    </h3>
                    <p className="text-sm text-gray-600">{client.email}</p>
                  </div>
                  <div className="flex items-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        client.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {client.status === "active" ? "Validé" : "En attente"}
                    </span>
                    <button
                      onClick={() => toggleClientValidation(client)}
                      className="ml-4 px-3 py-1 rounded text-white bg-green-500 hover:bg-green-600"
                    >
                      {expandedClient === client._id ? "Fermer" : "Valider"}
                    </button>
                  </div>
                </div>

                {expandedClient === client._id && (
                  <div className="p-4 bg-gray-50">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700 mb-3 border-b pb-2">
                          Informations du Client
                        </h4>
                        {validationFields.map((fieldInfo) => (
                          <div
                            key={fieldInfo.key}
                            className="flex items-start py-3 border-b border-gray-100"
                          >
                            <span className="font-medium w-1/3 text-gray-700">
                              {fieldInfo.label}
                            </span>
                            <div className="flex-1 flex flex-col">
                              <span
                                className={`px-3 py-2 rounded bg-gray-50 border ${
                                  validatedFields[client._id]?.[fieldInfo.key]
                                    ? "bg-green-50 border-green-200"
                                    : ""
                                }`}
                              >
                                {client[fieldInfo.key] || "-"}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                toggleFieldValidation(client._id, fieldInfo.key)
                              }
                              className="ml-2 p-2 rounded-full hover:bg-gray-200 flex-shrink-0"
                            >
                              {validatedFields[client._id]?.[fieldInfo.key] ? (
                                <FaCheckCircle className="text-green-500 text-lg" />
                              ) : (
                                <FaRegCheckCircle className="text-gray-400" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 Vflex justify-end">
                        <ValidateClientButton
                          clientId={client._id}
                          allFieldsValidated={allFieldsValidated(client._id)}
                          validatedCount={
                            (validatedFields[client._id] &&
                              Object.values(validatedFields[client._id]).filter(
                                Boolean
                              ).length) ||
                            0
                          }
                          totalFields={validationFields.length}
                          onValidate={async () => {
                            try {
                              await validateClient(client);
                            } catch (e) {}
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">
            Clients validés ({clients.valid.length})
          </h2>
          {clients.valid.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">Aucun client validé</p>
            </div>
          ) : (
            clients.valid.map((client) => (
              <div
                key={client._id}
                className="bg-white rounded-lg shadow overflow-hidden"
              >
                <div
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleClient(client)}
                >
                  <div>
                    <h3 className="font-semibold text-lg flex items-center">
                      <FaUser className="mr-2 text-blue-600" />
                      {client.raisonSociale || client.name}
                    </h3>
                    <p className="text-sm text-gray-600">{client.email}</p>
                  </div>
                  <div className="flex items-center">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Validé
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmUnvalidate(client);
                      }}
                      className="ml-4 px-3 py-1 rounded text-yellow-800 bg-yellow-100 hover:bg-yellow-200"
                    >
                      Annuler la validation
                    </button>
                  </div>
                </div>

                {expandedClient === client._id && (
                  <div className="p-4 bg-gray-50">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-700 mb-3 border-b pb-2">
                          Informations du Client
                        </h4>
                        {validationFields.map((field) => (
                          <div
                            key={field}
                            className="flex items-start py-3 border-b border-gray-100"
                          >
                            <span className="font-medium w-1/3 text-gray-700">
                              {field === "raisonSociale"
                                ? "Raison Sociale"
                                : field === "siret"
                                ? "SIRET"
                                : field === "adresse"
                                ? "Adresse"
                                : field === "codePostal"
                                ? "Code Postal"
                                : field === "ville"
                                ? "Ville"
                                : field === "pays"
                                ? "Pays"
                                : field === "email"
                                ? "Email"
                                : field === "telephone"
                                ? "Téléphone"
                                : field === "contactsClient"
                                ? "Contacts"
                                : "Date de Création"}
                            </span>
                            <div className="flex-1 flex flex-col">
                              <span
                                className={`px-3 py-2 rounded bg-gray-50 border ${
                                  validatedFields[client._id]?.[field]
                                    ? "bg-green-50 border-green-200"
                                    : ""
                                }`}
                              >
                                {client[field] || "-"}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                toggleFieldValidation(client._id, field)
                              }
                              className="ml-2 p-2 rounded-full hover:bg-gray-200 flex-shrink-0"
                            >
                              {validatedFields[client._id]?.[field] ? (
                                <FaCheckCircle className="text-green-500 text-lg" />
                              ) : (
                                <FaRegCheckCircle className="text-gray-400" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Confirmation dialog for unvalidation */}
      {showUnvalidateConfirm && clientToUnvalidate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">
              Confirmer l'invalidation
            </h3>
            <p className="mb-6">
              Êtes-vous sûr de vouloir invalider le client "
              {clientToUnvalidate.raisonSociale || clientToUnvalidate.name}" ?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelUnvalidate}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Annuler
              </button>
              <button
                onClick={() => unvalidateClient(clientToUnvalidate)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                disabled={validationInProgress === clientToUnvalidate._id}
              >
                {validationInProgress === clientToUnvalidate._id
                  ? "Traitement..."
                  : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
