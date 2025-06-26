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
  const [validationInProgress, setValidationInProgress] = useState(null);
  const [validatedFields, setValidatedFields] = useState({});
  const [clientToUnvalidate, setClientToUnvalidate] = useState(null);
  const [showUnvalidateConfirm, setShowUnvalidateConfirm] = useState(false);
  const [editableFieldValues, setEditableFieldValues] = useState({});
  const [searchTermPending, setSearchTermPending] = useState("");
  const [searchTermValid, setSearchTermValid] = useState("");

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
      {
        key: "CompteClientNumber",
        label: "Numéro Compte Client",
        editable: true,
      },
      {
        key: "Payement",
        label: "Type de Paiement",
        editable: true,
        type: "radio",
        options: ["vendeur", "mandataire"],
      },
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

  const handleEditableFieldChange = (clientId, fieldName, value) => {
    setEditableFieldValues((prev) => ({
      ...prev,
      [clientId]: {
        ...(prev[clientId] || {}),
        [fieldName]: value,
      },
    }));
  };

  const allFieldsValidated = (clientId) => {
    if (!clientId || !validatedFields[clientId]) {
      console.log(`No validation fields found for client ${clientId}`);
      return false;
    }

    const clientValidations = validatedFields[clientId];
    const clientEditableValues = editableFieldValues[clientId] || {};

    // Check that all fields are validated
    const allChecked = validationFields.every(
      (fieldInfo) => clientValidations[fieldInfo.key] === true
    );

    // Check that all editable fields have values
    const editableFieldsFilled = validationFields
      .filter((fieldInfo) => fieldInfo.editable)
      .every((fieldInfo) => {
        const value = clientEditableValues[fieldInfo.key];
        return value && value.trim() !== "";
      });

    const allValid = allChecked && editableFieldsFilled;

    console.log(`Validating client ${clientId}:`, {
      clientValidations,
      clientEditableValues,
      allChecked,
      editableFieldsFilled,
      allValid,
      fieldStates: validationFields.map((fieldInfo) => ({
        field: fieldInfo.key,
        isValid: clientValidations[fieldInfo.key] === true,
        value: clientValidations[fieldInfo.key],
        editableValue: fieldInfo.editable
          ? clientEditableValues[fieldInfo.key]
          : null,
      })),
    });

    return allValid;
  };

  const validateClient = async (client) => {
    if (!client) {
      console.error("No client provided for validation");
      return;
    }

    const clientId = client._id || client.id;
    if (!clientId) {
      console.error("No client ID provided");
      return;
    }

    console.log("Starting validation for client:", clientId);
    console.log("Current client:", client);

    try {
      setValidationInProgress(clientId);
      const idString = clientId.toString();

      console.log(`Validating client ${idString}...`);

      // Prepare the update data including editable field values
      const updateData = {
        status: "active",
        ...editableFieldValues[clientId], // Include the editable field values
      };

      console.log("Update data being sent:", updateData);

      // Use the correct endpoint from the backend
      const response = await fetch(`/api/customer/clients/${idString}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(updateData),
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
      // Clear validation state for this client
      setValidatedFields((prev) => {
        const newState = { ...prev };
        delete newState[clientId];
        return newState;
      });
      // Clear editable field values for this client
      setEditableFieldValues((prev) => {
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
      // Initialize editable field values with existing client data
      setEditableFieldValues((prev) => ({
        ...prev,
        [client._id]: {
          CompteClientNumber: client.CompteClientNumber || "",
          Payement: client.Payement || "",
          ...(prev[client._id] || {}),
        },
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
              name:
                fullDetails.raisonSociale || client.raisonSociale || "Sans nom",
              email:
                fullDetails.contact1Email ||
                fullDetails.email ||
                client.email ||
                "Non spécifié",
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

  // Filter clients based on search terms
  const filteredPendingClients = clients.pending.filter(
    (client) =>
      (client.raisonSociale || client.name || "")
        .toLowerCase()
        .includes(searchTermPending.toLowerCase()) ||
      (client.email || "")
        .toLowerCase()
        .includes(searchTermPending.toLowerCase())
  );

  const filteredValidClients = clients.valid.filter(
    (client) =>
      (client.raisonSociale || client.name || "")
        .toLowerCase()
        .includes(searchTermValid.toLowerCase()) ||
      (client.email || "").toLowerCase().includes(searchTermValid.toLowerCase())
  );

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
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-8">
        Clients à Valider
      </h1>

      <div className="space-y-8">
        {/* Pending Clients Section */}
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-yellow-700">
              Clients en attente ({filteredPendingClients.length})
            </h2>
            <input
              type="text"
              placeholder="Rechercher un client en attente..."
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
              value={searchTermPending}
              onChange={(e) => setSearchTermPending(e.target.value)}
            />
          </div>
          {filteredPendingClients.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">
                {searchTermPending
                  ? "Aucun client en attente trouvé avec ce terme de recherche"
                  : "Aucun client en attente"}
              </p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-yellow-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Nom du Client
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Email
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Statut
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPendingClients.map((client) => (
                    <React.Fragment key={client._id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FaUser className="mr-2 text-blue-700" />
                            <span className="text-sm font-medium text-gray-900">
                              {client.raisonSociale || client.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {client.email || "Non spécifié"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            En attente
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => toggleClient(client)}
                            className={`font-medium ${
                              expandedClient === client._id
                                ? "text-blue-600 hover:text-blue-900"
                                : "text-green-600 hover:text-green-900"
                            }`}
                          >
                            {expandedClient === client._id
                              ? "Fermer"
                              : "Valider"}
                          </button>
                        </td>
                      </tr>
                      {expandedClient === client._id && (
                        <tr className="bg-gray-50">
                          <td colSpan="4" className="p-6">
                            <div className="space-y-4">
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
                                    {fieldInfo.editable ? (
                                      fieldInfo.type === "radio" ? (
                                        <div className="flex items-center space-x-4">
                                          {fieldInfo.options.map((option) => (
                                            <label
                                              key={option}
                                              className="flex items-center"
                                            >
                                              <input
                                                type="radio"
                                                name={`${client._id}_${fieldInfo.key}`}
                                                value={option}
                                                checked={
                                                  editableFieldValues[
                                                    client._id
                                                  ]?.[fieldInfo.key] === option
                                                }
                                                onChange={(e) =>
                                                  handleEditableFieldChange(
                                                    client._id,
                                                    fieldInfo.key,
                                                    e.target.value
                                                  )
                                                }
                                                className="mr-2"
                                              />
                                              <span className="capitalize">
                                                {option}
                                              </span>
                                            </label>
                                          ))}
                                        </div>
                                      ) : (
                                        <input
                                          type="text"
                                          placeholder={`Saisir ${fieldInfo.label}`}
                                          value={
                                            editableFieldValues[client._id]?.[
                                              fieldInfo.key
                                            ] || ""
                                          }
                                          onChange={(e) =>
                                            handleEditableFieldChange(
                                              client._id,
                                              fieldInfo.key,
                                              e.target.value
                                            )
                                          }
                                          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                      )
                                    ) : (
                                      <span
                                        className={`px-3 py-2 rounded bg-gray-50 border ${
                                          validatedFields[client._id]?.[
                                            fieldInfo.key
                                          ]
                                            ? "bg-green-50 border-green-200"
                                            : ""
                                        }`}
                                      >
                                        {client[fieldInfo.key] || "-"}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() =>
                                      toggleFieldValidation(
                                        client._id,
                                        fieldInfo.key
                                      )
                                    }
                                    className="ml-2 p-2 rounded-full hover:bg-gray-200 flex-shrink-0"
                                  >
                                    {validatedFields[client._id]?.[
                                      fieldInfo.key
                                    ] ? (
                                      <FaCheckCircle className="text-green-500 text-lg" />
                                    ) : (
                                      <FaRegCheckCircle className="text-gray-400" />
                                    )}
                                  </button>
                                </div>
                              ))}

                              <div className="mt-6 flex justify-end">
                                <ValidateClientButton
                                  clientId={client._id}
                                  allFieldsValidated={allFieldsValidated(
                                    client._id
                                  )}
                                  validatedCount={
                                    (validatedFields[client._id] &&
                                      Object.values(
                                        validatedFields[client._id]
                                      ).filter(Boolean).length) ||
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

        {/* Valid Clients Section */}
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-green-700">
              Clients validés ({filteredValidClients.length})
            </h2>
            <input
              type="text"
              placeholder="Rechercher un client validé..."
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sna-primary"
              value={searchTermValid}
              onChange={(e) => setSearchTermValid(e.target.value)}
            />
          </div>
          {filteredValidClients.length === 0 ? (
            <div className="bg-white p-6 rounded-lg shadow text-center">
              <p className="text-gray-600">
                {searchTermValid
                  ? "Aucun client validé trouvé avec ce terme de recherche"
                  : "Aucun client validé"}
              </p>
            </div>
          ) : (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-green-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Nom du Client
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Email
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Statut
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredValidClients.map((client) => (
                    <React.Fragment key={client._id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FaUser className="mr-2 text-blue-700" />
                            <span className="text-sm font-medium text-gray-900">
                              {client.raisonSociale || client.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {client.email || "Non spécifié"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Validé
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => toggleClient(client)}
                            className="text-blue-600 hover:text-blue-900 font-medium mr-4"
                          >
                            {expandedClient === client._id
                              ? "Fermer"
                              : "Voir détails"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmUnvalidate(client);
                            }}
                            className="text-red-600 hover:text-red-900 font-medium"
                          >
                            Annuler validation
                          </button>
                        </td>
                      </tr>
                      {expandedClient === client._id && (
                        <tr className="bg-gray-50">
                          <td colSpan="4" className="p-6">
                            <div className="space-y-4">
                              <h4 className="font-medium text-gray-700 mb-3 border-b pb-2">
                                Informations du Client - Client validé
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
                                    <span className="px-3 py-2 rounded bg-green-50 border border-green-200">
                                      {client[fieldInfo.key] || "-"}
                                    </span>
                                  </div>
                                  <div className="ml-2 p-2 flex-shrink-0">
                                    <FaCheckCircle className="text-green-500 text-lg" />
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
          )}
        </div>
      </div>

      {/* Unvalidate Confirmation Modal */}
      {showUnvalidateConfirm && (
        <div className="fixed inset-0 z-50 flex justify-center items-center">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black opacity-50"></div>
          {/* Modal */}
          <div className="relative bg-white rounded-lg shadow p-6 z-10 min-w-[320px]">
            <h2 className="text-lg font-bold text-gray-800 mb-2">
              Confirmation
            </h2>
            <p className="text-gray-600 mb-4">
              Êtes-vous sûr de vouloir annuler la validation de ce client ?
            </p>
            <div className="flex justify-end">
              <button
                onClick={cancelUnvalidate}
                className="px-4 py-2 rounded bg-gray-300 text-gray-500 hover:bg-gray-400"
              >
                Annuler
              </button>
              <button
                onClick={() => unvalidateClient(clientToUnvalidate)}
                className="ml-4 px-4 py-2 rounded bg-yellow-500 hover:bg-yellow-600 text-white"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
