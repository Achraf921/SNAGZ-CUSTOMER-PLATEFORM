import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { FiEdit2, FiX, FiCheck, FiCalendar } from "react-icons/fi";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const ClientDetails = (props) => {
  const params = useParams();
  const clientId = props.clientId || params.clientId || params.id;

  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [saving, setSaving] = useState(false); // For global save operation
  const [saveMessage, setSaveMessage] = useState(null); // For global save operation
  const [tempValue, setTempValue] = useState(null); // Current value in the active editor input
  const [pendingChanges, setPendingChanges] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const formatFieldName = (field) => {
    if (!field) return "";
    return field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, " ");
  };

  const fetchClientDetails = useCallback(async () => {
    if (!clientId || clientId === "undefined") {
      setError("Aucun ID client valide fourni");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const apiUrl = `http://localhost:3000/api/internal/clients/${clientId}`;
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        credentials: "include",
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText ||
            `Erreur lors de la récupération du client (${response.status})`
        );
      }
      const data = await response.json();
      if (!data.success || !data.customer) {
        throw new Error("Données client non valides");
      }
      setClient(data.customer);
      setPendingChanges({}); // Reset pending changes on fresh fetch
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(
        `Erreur: ${err.message || "Impossible de charger les détails du client"}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [clientId]); // Add clientId to useCallback dependency array

  useEffect(() => {
    if (clientId && clientId !== "undefined") {
      fetchClientDetails();
    } else {
      setError("ID client manquant ou invalide");
      setIsLoading(false);
    }
  }, [clientId, fetchClientDetails]); // Add fetchClientDetails to useEffect dependencies

  const getInputType = (field, value) => {
    if (field.toLowerCase().includes("email")) return "email";
    if (
      field.toLowerCase().includes("phone") ||
      field.toLowerCase().includes("tel")
    )
      return "tel";
    if (field.toLowerCase().includes("date")) return "date";
    if (typeof value === "boolean") return "checkbox";
    if (typeof value === "number") return "number";
    return "text";
  };

  const startEditing = (field, currentValue) => {
    setEditingField(field);
    // Use value from pendingChanges if available, otherwise from client state
    const valueToEdit =
      pendingChanges[field] !== undefined
        ? pendingChanges[field]
        : currentValue;
    setTempValue(valueToEdit);
  };

  const cancelEditing = () => {
    setEditingField(null);
    // tempValue will be reset/ignored as editingField is null
  };

  const handleFieldChange = (e) => {
    const { value, type, checked } = e.target;
    setTempValue(type === "checkbox" ? checked : value);
  };

  const handleDateChange = (date) => {
    setTempValue(date);
  };

  const handleConfirmFieldEdit = (field) => {
    const newPendingChanges = { ...pendingChanges, [field]: tempValue };
    setPendingChanges(newPendingChanges);
    setHasUnsavedChanges(true);
    setEditingField(null);
    // Optimistically update client state for immediate UI reflection, or rely on display logic
    // For simplicity, we'll let the display logic pick up from pendingChanges
  };

  const saveAllChanges = async () => {
    if (Object.keys(pendingChanges).length === 0) {
      setSaveMessage("Aucune modification à enregistrer.");
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    if (!clientId) {
      setSaveMessage("Erreur: ID client manquant pour la sauvegarde.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const url = `http://localhost:3000/api/internal/clients/${clientId}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        credentials: "include",
        body: JSON.stringify(pendingChanges),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText ||
            `Erreur lors de la sauvegarde (${response.status} ${response.statusText})`
        );
      }

      // Update client state with successfully saved changes
      setClient((prevClient) => ({ ...prevClient, ...pendingChanges }));
      setPendingChanges({});
      setHasUnsavedChanges(false);
      setSaveMessage(
        "Toutes les modifications ont été enregistrées avec succès !"
      );
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage(`Erreur lors de la sauvegarde: ${err.message}`);
      // Optionally, keep pendingChanges so user can retry, or clear them
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sna-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-md">
        <p className="font-medium">Erreur</p>
        <p>{error}</p>
        <button
          onClick={() => {
            setIsLoading(true);
            fetchClientDetails();
          }}
          className="mt-2 text-sm text-red-600 hover:underline"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-4 bg-yellow-50 text-yellow-700 rounded-md">
        Aucune donnée client disponible.
      </div>
    );
  }

  const excludeFields = [
    "_id",
    "__v",
    "createdAt",
    "updatedAt",
    "password",
    "hashedPassword",
    "salt",
    "shops",
    "userId",
    "status",
    "submittedAt",
    "dateSoumission",
    "nomSoumission",
    "fonctionSoumission",
    "documented",
  ];

  return (
    <div className="flex-1 overflow-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Détails du client:{" "}
        {client.raisonSociale || client.nomSoumission || clientId}
      </h1>

      {/* Global Save Button and Message Area */}
      {(hasUnsavedChanges || saveMessage) && (
        <div className="mb-4 p-4 sticky top-0 bg-white z-10 shadow-sm rounded-md">
          {saveMessage && (
            <div
              className={`mb-2 p-3 rounded-md text-sm ${saveMessage.includes("Erreur") ? "bg-red-100 text-red-800" : saveMessage.includes("Aucune modification") ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}
            >
              {saveMessage}
            </div>
          )}
          {hasUnsavedChanges && (
            <button
              onClick={saveAllChanges}
              disabled={saving}
              className="w-full px-4 py-2 bg-sna-primary text-white rounded-md hover:bg-sna-primary-dark focus:outline-none focus:ring-2 focus:ring-sna-primary-light focus:ring-opacity-50 disabled:opacity-50 flex items-center justify-center"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                  Enregistrement...
                </>
              ) : (
                "Enregistrer les modifications"
              )}
            </button>
          )}
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="border-t border-gray-200">
          <dl>
            {Object.entries(client)
              .filter(([key]) => !excludeFields.includes(key))
              .map(([field, value]) => {
                const originalValue = client && client[field];
                const currentValue =
                  pendingChanges[field] !== undefined
                    ? pendingChanges[field]
                    : originalValue;
                const isEditing = editingField === field;
                const inputType = getInputType(field, currentValue);

                let displayValue;
                if (typeof currentValue === "boolean") {
                  displayValue = currentValue ? "Oui" : "Non";
                } else if (
                  currentValue instanceof Date ||
                  (typeof currentValue === "string" &&
                    field.toLowerCase().includes("date"))
                ) {
                  try {
                    // Ensure date is valid before formatting
                    const dateObj = new Date(currentValue);
                    if (isNaN(dateObj.getTime())) {
                      displayValue = currentValue || "-"; // Show original string if invalid date
                    } else {
                      displayValue = dateObj.toLocaleDateString("fr-FR");
                    }
                  } catch (e) {
                    displayValue = currentValue || "-";
                  }
                } else {
                  displayValue =
                    currentValue === null ||
                    currentValue === undefined ||
                    currentValue === ""
                      ? "-"
                      : String(currentValue);
                }

                return (
                  <div
                    key={field}
                    className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 border-b border-gray-100 hover:bg-gray-50 group relative"
                  >
                    <dt className="text-sm font-medium text-gray-500 flex items-center">
                      {formatFieldName(field)}
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 flex items-center justify-between">
                      {isEditing ? (
                        <div className="flex items-center w-full">
                          {inputType === "checkbox" ? (
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={!!tempValue}
                                onChange={handleFieldChange}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                            </div>
                          ) : inputType === "date" ? (
                            <div className="relative w-full">
                              <DatePicker
                                selected={
                                  tempValue &&
                                  !isNaN(new Date(tempValue).getTime())
                                    ? new Date(tempValue)
                                    : null
                                }
                                onChange={handleDateChange}
                                dateFormat="dd/MM/yyyy"
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                placeholderText="JJ/MM/AAAA"
                                popperPlacement="top-start"
                              />
                              <FiCalendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                          ) : (
                            <input
                              type={inputType}
                              value={
                                tempValue === null || tempValue === undefined
                                  ? ""
                                  : tempValue
                              }
                              onChange={handleFieldChange}
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                              autoFocus
                            />
                          )}
                          <button
                            onClick={() => handleConfirmFieldEdit(field)}
                            className="ml-2 p-1 text-green-600 hover:bg-green-100 rounded-full"
                            title="Confirmer"
                          >
                            <FiCheck size={20} />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="ml-1 p-1 text-red-600 hover:bg-red-100 rounded-full"
                            title="Annuler"
                          >
                            <FiX size={20} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="flex-grow break-words">
                            {displayValue}
                          </span>
                          <button
                            onClick={() => startEditing(field, currentValue)}
                            className="ml-2 p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-gray-100"
                            title="Modifier"
                          >
                            <FiEdit2 size={16} />
                          </button>
                        </>
                      )}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default ClientDetails;
