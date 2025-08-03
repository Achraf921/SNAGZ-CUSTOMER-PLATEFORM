import React, { useState, useEffect } from "react";
import WelcomeForm from "./WelcomeForm";
import {
  validateUserIdentity,
  clearAllAuthData,
} from "../../utils/authSecurity";
import { FaLock, FaEye, FaEyeSlash, FaCheckCircle } from "react-icons/fa";

const ManageAccount = () => {
  const [customerData, setCustomerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWelcomeForm, setShowWelcomeForm] = useState(false);
  const [editingFields, setEditingFields] = useState({});
  const [editedData, setEditedData] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);
  const [updateMessage, setUpdateMessage] = useState(null);

  // Password change states
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    console.log("🔒 SECURITY: Starting manage account security check...");

    // CRITICAL: Validate user identity first before any processing
    const identityCheck = validateUserIdentity();

    if (!identityCheck.valid) {
      console.error(
        "🚨 SECURITY: User identity validation failed in ManageAccount:",
        identityCheck.reason
      );
      clearAllAuthData();
      window.location.href = "/client/login";
      return;
    }

    console.log("✅ SECURITY: User identity validated for account management");

    // Check if this is a first-time login (after password change)
    const isFirstLogin = sessionStorage.getItem("isFirstLogin") === "true";

    if (isFirstLogin) {
      console.log(
        "🎉 First-time login detected - automatically showing welcome form"
      );
      setShowWelcomeForm(true);
      setLoading(false);
      // Clear the first login flag
      sessionStorage.removeItem("isFirstLogin");
      return;
    }

    // Try to get userInfo from session or local storage
    let userInfoStr =
      sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
    let userInfo = {};
    let sub = null;

    try {
      if (userInfoStr) {
        userInfo = JSON.parse(userInfoStr);
        // Extract the sub attribute - this is the primary identifier we want to use
        sub = userInfo.sub;
      }
    } catch (error) {
      console.error("Error parsing userInfo:", error);
    }

    // Get userId from userInfo as fallback
    let userId = userInfo.userId;

    // If no userId in userInfo, try to get it directly from storage as a last resort
    if (!userId) {
      userId =
        sessionStorage.getItem("userId") || localStorage.getItem("userId");
    }

    // Security: Removed debug logging that exposed sensitive session/local storage data

    // ALWAYS prioritize the sub attribute from Cognito
    // This is the unique identifier that won't change
    const effectiveUserId = sub || userId;

    if (!effectiveUserId) {
      console.error("No user identifier found in storage");
      setError(
        "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
      );
      setLoading(false);
      return;
    }

    console.log("FINAL userId for API call (should be sub):", effectiveUserId);

    fetchCustomerData(effectiveUserId);
  }, []);

  const fetchCustomerData = async (userId) => {
    try {
      setLoading(true);
      setError(null);
      setShowWelcomeForm(false);

      console.log("==== FETCH CUSTOMER DEBUG INFO ====");
      console.log("Fetching customer data for userId:", userId);
      console.log("Current timestamp:", new Date().toISOString());
      console.log("==== END DEBUG INFO ====");

      // Use relative path to leverage Vite proxy for development
      const apiUrl = `/api/customer/by-user-id/${userId}`;

      console.log("API URL:", apiUrl);

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text);
      }

      if (!response.ok) {
        if (response.status === 404) {
          // Customer profile not found - show welcome form option
          console.log("Customer profile not found for userId:", userId);
          setError(
            "Profil client non trouvé. Veuillez compléter le formulaire de bienvenue pour créer votre profil."
          );
          return;
        }
        throw new Error(
          data.message ||
            `Erreur lors de la récupération des données (${response.status})`
        );
      }

      // Handle response data
      if (data.success) {
        console.log("Customer data retrieved successfully:", data.customer);
        setCustomerData(data.customer);
        // Initialize editedData with the customer data
        setEditedData(data.customer);
      } else if (data.isNewUser && data.needsWelcomeForm) {
        // Handle new users who need to complete welcome form
        console.log(
          "✨ New user detected - showing welcome form automatically"
        );
        setCustomerData(null);
        setError(null);
        setShowWelcomeForm(true);
      } else {
        // Handle other error cases
        console.log("API returned error:", data.message);
        setError(data.message || "Erreur lors de la récupération des données");
      }
    } catch (err) {
      console.error("Erreur lors de la récupération des données client:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveChanges = async () => {
    try {
      setSavingChanges(true);
      setUpdateMessage(null);

      // Try to get userInfo from session or local storage
      let userInfoStr =
        sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
      let userInfo = {};
      let sub = null;
      let userId = null;

      try {
        if (userInfoStr) {
          userInfo = JSON.parse(userInfoStr);
          // Always prioritize the sub attribute from Cognito
          sub = userInfo.sub;
          // Get userId as fallback
          userId = userInfo.userId;
        }
      } catch (error) {
        console.error("Error parsing userInfo:", error);
      }

      // If no userId in userInfo, try to get it directly from storage as last resort
      if (!userId) {
        userId =
          sessionStorage.getItem("userId") || localStorage.getItem("userId");
      }

      // Use sub as the primary identifier, fall back to userId if necessary
      const effectiveUserId = sub || userId;

      if (!effectiveUserId) {
        throw new Error("Identifiant utilisateur non trouvé");
      }

      console.log("==== SAVE CHANGES DEBUG INFO ====");
      console.log("User Info from storage:", userInfo);
      console.log("sub from userInfo:", sub);
      console.log("userId from userInfo:", userId);
      console.log(
        "FINAL userId for saving changes (should be sub):",
        effectiveUserId
      );
      console.log("==== END SAVE CHANGES DEBUG INFO ====");

      // Determine API URL based on environment
      const apiUrl = `/api/customer/update/${effectiveUserId}`;

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editedData),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Erreur lors de la mise à jour des données (${response.status})`
        );
      }

      const data = await response.json();
      setCustomerData(data.customer);
      setEditingFields({}); // Clear all editing fields
      setUpdateMessage({
        type: "success",
        text: "Profil mis à jour avec succès",
      });

      // Scroll to top to show the success message
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Erreur lors de la mise à jour des données client:", err);
      setUpdateMessage({ type: "error", text: err.message });
    } finally {
      setSavingChanges(false);
    }
  };

  const handleInputChange = (key, value) => {
    setEditedData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleWelcomeFormSubmit = async (formData) => {
    try {
      setLoading(true);

      // Try to get userInfo from session or local storage
      let userInfoStr =
        sessionStorage.getItem("userInfo") || localStorage.getItem("userInfo");
      let userInfo = {};
      let userId;

      try {
        if (userInfoStr) {
          userInfo = JSON.parse(userInfoStr);
          userId = userInfo.userId; // Get userId from userInfo object
        }
      } catch (error) {
        console.error("Error parsing userInfo:", error);
      }

      // If no userId in userInfo, try to get it directly from storage
      if (!userId) {
        userId =
          sessionStorage.getItem("userId") || localStorage.getItem("userId");
      }

      if (!userId) {
        throw new Error(
          "Identifiant utilisateur non trouvé. Veuillez vous reconnecter."
        );
      }

      // Get the sub attribute from userInfo if available
      let sub = null;
      try {
        const userInfoStr =
          sessionStorage.getItem("userInfo") ||
          localStorage.getItem("userInfo");
        if (userInfoStr) {
          const parsedUserInfo = JSON.parse(userInfoStr);
          sub = parsedUserInfo.sub;
        }
      } catch (error) {
        console.error("Error parsing userInfo for sub:", error);
      }

      // ALWAYS use the sub as the userId - this is the most reliable identifier
      // If sub is not available, log an error but still try with userId as fallback
      if (!sub) {
        console.error(
          "WARNING: No sub found in userInfo - this may cause welcome form submission failures"
        );
      }

      const effectiveUserId = sub || userId;
      console.log(
        "FINAL userId for welcome form (should be sub):",
        effectiveUserId
      );

      // Add userId to form data
      const formDataWithUserId = {
        ...formData,
        userId: effectiveUserId,
      };

      // Use relative path to leverage Vite proxy for development
      const apiUrl = "/api/customer/welcome-form";

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formDataWithUserId),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Erreur lors de la soumission du formulaire (${response.status})`
        );
      }

      const data = await response.json();
      console.log("Welcome form submitted successfully:", data);

      // Form submitted successfully
      localStorage.setItem("hasCompletedWelcomeForm", "true");
      setShowWelcomeForm(false);
      setUpdateMessage({
        type: "success",
        text: "Profil client créé avec succès",
      });

      // Refresh customer data with the same userId
      fetchCustomerData(userId);
    } catch (error) {
      console.error("Erreur lors de la soumission du formulaire:", error);
      setError(`Erreur lors de la soumission du formulaire: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Password change handlers
  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (passwordErrors[name]) {
      setPasswordErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const validatePasswordForm = () => {
    const newErrors = {};

    // Current password validation
    if (!passwordFormData.currentPassword) {
      newErrors.currentPassword = "Le mot de passe actuel est requis";
    }

    // New password validation
    if (!passwordFormData.newPassword) {
      newErrors.newPassword = "Le nouveau mot de passe est requis";
    } else if (passwordFormData.newPassword.length < 8) {
      newErrors.newPassword =
        "Le mot de passe doit contenir au moins 8 caractères";
    } else if (
      !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordFormData.newPassword)
    ) {
      newErrors.newPassword =
        "Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre";
    }

    // Confirm password validation
    if (!passwordFormData.confirmPassword) {
      newErrors.confirmPassword = "La confirmation du mot de passe est requise";
    } else if (
      passwordFormData.newPassword !== passwordFormData.confirmPassword
    ) {
      newErrors.confirmPassword = "Les mots de passe ne correspondent pas";
    }

    // Check if new password is different from current
    if (
      passwordFormData.currentPassword &&
      passwordFormData.newPassword &&
      passwordFormData.currentPassword === passwordFormData.newPassword
    ) {
      newErrors.newPassword =
        "Le nouveau mot de passe doit être différent de l'actuel";
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSuccess(false);

    if (!validatePasswordForm()) {
      return;
    }

    setIsChangingPassword(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: passwordFormData.currentPassword,
          newPassword: passwordFormData.newPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPasswordSuccess(true);
        setPasswordFormData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setPasswordErrors({});

        // Show success message for 3 seconds then hide
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        if (data.error === "Invalid current password") {
          setPasswordErrors({
            currentPassword: "Mot de passe actuel incorrect",
          });
        } else {
          setPasswordErrors({
            general:
              data.message || "Erreur lors du changement de mot de passe",
          });
        }
      }
    } catch (error) {
      console.error("Error changing password:", error);
      setPasswordErrors({
        general: "Erreur de connexion. Veuillez réessayer.",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Function to toggle editing for a specific field
  const toggleFieldEdit = (key) => {
    setEditingFields((prev) => {
      const newState = { ...prev };
      if (newState[key]) {
        delete newState[key];
      } else {
        newState[key] = true;
      }
      return newState;
    });
  };

  // Function to format section data for display with edit capability
  const renderSectionData = (sectionData, sectionTitle) => {
    if (!sectionData || Object.keys(sectionData).length === 0) return null;

    return (
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h3 className="text-xl font-semibold text-sna-primary mb-4 pb-2 border-b border-gray-200">
          {sectionTitle}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(sectionData).map(([key, value]) => {
            // Skip non-displayable keys
            if (
              [
                "userId",
                "status",
                "submittedAt",
                "_id",
                "shops",
                "shopsCount",
                "updatedAt",
                "CompteClientNumber", // Hidden from user view and editing
                "documented", // Hidden from user view and editing
                "Payement", // Hidden from user view and editing
                "payment", // Hidden from user view and editing
              ].includes(key)
            )
              return null;

            // Format the key for display
            const formattedKey = key
              .replace(/([A-Z])/g, " $1") // Add space before capital letters
              .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
              .replace(/([0-9])/g, " $1"); // Add space before numbers

            const isEditing = editingFields[key];

            return (
              <div key={key} className="mb-3">
                <div className="flex justify-between items-center">
                  <div className="text-sm font-medium text-gray-500">
                    {formattedKey}
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => toggleFieldEdit(key)}
                      className="text-gray-400 hover:text-sna-primary focus:outline-none"
                      title="Modifier ce champ"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <div className="flex mt-1">
                    <input
                      type="text"
                      value={editedData[key] || ""}
                      onChange={(e) => handleInputChange(key, e.target.value)}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => toggleFieldEdit(key)}
                      className="ml-2 inline-flex items-center p-2 border border-gray-300 rounded-md text-sm text-gray-500 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
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
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 text-base text-gray-900">
                    {(() => {
                      if (value === null || value === undefined || value === "")
                        return "-";
                      if (typeof value === "object") {
                        // Show a summary for arrays and objects
                        if (Array.isArray(value)) {
                          return value.length === 0 ? "-" : value.join(", ");
                        }
                        // For objects, show a JSON string or a summary
                        try {
                          // If it's a shop or module object, show its main keys/values
                          if (
                            value.nomProjet ||
                            value.nomClient ||
                            value.shopId
                          ) {
                            return Object.entries(value)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(", ");
                          }
                          return JSON.stringify(value);
                        } catch {
                          return "[Objet]";
                        }
                      }
                      return value.toString();
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sna-primary"></div>
      </div>
    );
  }

  // Render error state with option to complete welcome form
  if (error || !customerData) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <svg
            className="mx-auto h-16 w-16 text-sna-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">
            {error && error.includes("Profil client non trouvé")
              ? "Profil client non trouvé"
              : "Erreur"}
          </h2>
          <p className="mt-2 text-gray-600">
            {error || "Nous n'avons pas pu trouver votre profil client."}
          </p>
        </div>

        {error && error.includes("Profil client non trouvé") && (
          <div className="mt-6 text-center">
            <p className="mb-4 text-gray-700">
              Votre profil client n'existe pas encore dans notre base de
              données. Veuillez compléter le formulaire de bienvenue pour créer
              votre profil.
            </p>
            <button
              onClick={() => setShowWelcomeForm(true)}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary transition-all duration-200 transform hover:scale-105"
            >
              Compléter le formulaire de bienvenue
            </button>
          </div>
        )}

        {showWelcomeForm && (
          <div className="mt-8 border-t border-gray-200 pt-8">
            <h3 className="text-xl font-semibold mb-4 text-center">
              Formulaire de bienvenue
            </h3>
            <WelcomeForm onSubmit={handleWelcomeFormSubmit} />
          </div>
        )}
      </div>
    );
  }

  // Extract sections from customer data
  const societyInfo = {};
  const contactInfo = {};
  const signatureInfo = {};

  // Group data into sections
  Object.entries(customerData).forEach(([key, value]) => {
    if (key.includes("contact")) {
      contactInfo[key] = value;
    } else if (key.includes("Soumission")) {
      signatureInfo[key] = value;
    } else if (
      ![
        "userId",
        "status",
        "submittedAt",
        "_id",
        "shops",
        "shopsCount",
        "updatedAt",
        "CompteClientNumber", // Hidden from user view and editing
        "documented", // Hidden from user view and editing
        "Payement", // Hidden from user view and editing
        "payment", // Hidden from user view and editing
      ].includes(key)
    ) {
      societyInfo[key] = value;
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Mon Profil</h2>
            {customerData.status && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${customerData.status === "active" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}
              >
                {customerData.status === "active" ? "Validée" : "En attente"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Consultez et gérez vos informations personnelles.
          </p>
        </div>
        {Object.keys(editingFields).length > 0 && (
          <div className="flex space-x-4">
            <button
              onClick={saveChanges}
              disabled={savingChanges}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
            >
              {savingChanges ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              onClick={() => {
                setEditingFields({});
                setEditedData(customerData); // Reset to original data
              }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {updateMessage && (
        <div
          className={`mb-6 p-4 rounded-md ${updateMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          <div className="flex">
            {updateMessage.type === "success" ? (
              <svg
                className="h-5 w-5 text-green-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5 text-red-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <p className="ml-3">{updateMessage.text}</p>
          </div>
        </div>
      )}

      {/* Display submission date if available */}
      {customerData.submittedAt && (
        <div className="text-sm text-gray-500 mb-6">
          Soumis le:{" "}
          {new Date(customerData.submittedAt).toLocaleDateString("fr-FR", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}

      {/* Render each section */}
      {renderSectionData(societyInfo, "Informations société")}
      {renderSectionData(contactInfo, "Contacts")}

      {/* Security section - Password Change */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-sna-primary mb-2 pb-2 border-b border-gray-200 flex items-center">
            <FaLock className="mr-2" />
            Sécurité
          </h3>
          <p className="text-sm text-gray-600">
            Modifiez votre mot de passe pour sécuriser votre compte.
          </p>
        </div>

        {/* Success Message */}
        {passwordSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
              <FaCheckCircle className="text-green-500 text-lg mr-3" />
              <div>
                <h4 className="text-green-800 font-medium">
                  Mot de passe modifié avec succès
                </h4>
                <p className="text-green-600 text-sm mt-1">
                  Votre mot de passe a été mis à jour. Utilisez-le lors de votre
                  prochaine connexion.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* General Error */}
        {passwordErrors.general && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 text-sm">{passwordErrors.general}</p>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-6">
          {/* Current Password */}
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-gray-700"
            >
              Mot de passe actuel <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 relative">
              <input
                type={showPasswords.current ? "text" : "password"}
                id="currentPassword"
                name="currentPassword"
                value={passwordFormData.currentPassword}
                onChange={handlePasswordChange}
                className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary sm:text-sm pr-10 ${
                  passwordErrors.currentPassword ? "border-red-500" : ""
                }`}
                placeholder="Saisissez votre mot de passe actuel"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility("current")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPasswords.current ? (
                  <FaEyeSlash className="h-4 w-4 text-gray-400" />
                ) : (
                  <FaEye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
            {passwordErrors.currentPassword && (
              <p className="mt-1 text-sm text-red-600">
                {passwordErrors.currentPassword}
              </p>
            )}
          </div>

          {/* New Password */}
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-gray-700"
            >
              Nouveau mot de passe <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 relative">
              <input
                type={showPasswords.new ? "text" : "password"}
                id="newPassword"
                name="newPassword"
                value={passwordFormData.newPassword}
                onChange={handlePasswordChange}
                className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary sm:text-sm pr-10 ${
                  passwordErrors.newPassword ? "border-red-500" : ""
                }`}
                placeholder="Saisissez votre nouveau mot de passe"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility("new")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPasswords.new ? (
                  <FaEyeSlash className="h-4 w-4 text-gray-400" />
                ) : (
                  <FaEye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
            {passwordErrors.newPassword && (
              <p className="mt-1 text-sm text-red-600">
                {passwordErrors.newPassword}
              </p>
            )}
            <div className="mt-2 text-xs text-gray-500">
              Le mot de passe doit contenir au moins 8 caractères avec une
              majuscule, une minuscule et un chiffre.
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-700"
            >
              Confirmer le nouveau mot de passe{" "}
              <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 relative">
              <input
                type={showPasswords.confirm ? "text" : "password"}
                id="confirmPassword"
                name="confirmPassword"
                value={passwordFormData.confirmPassword}
                onChange={handlePasswordChange}
                className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary sm:text-sm pr-10 ${
                  passwordErrors.confirmPassword ? "border-red-500" : ""
                }`}
                placeholder="Confirmez votre nouveau mot de passe"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility("confirm")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showPasswords.confirm ? (
                  <FaEyeSlash className="h-4 w-4 text-gray-400" />
                ) : (
                  <FaEye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
            {passwordErrors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">
                {passwordErrors.confirmPassword}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isChangingPassword}
              className={`px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary ${
                isChangingPassword
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-sna-primary hover:bg-sna-primary/90"
              }`}
            >
              {isChangingPassword ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Mise à jour...
                </div>
              ) : (
                "Changer le mot de passe"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Welcome form modal */}
      {showWelcomeForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">
                Formulaire de bienvenue
              </h3>
              <button
                onClick={() => setShowWelcomeForm(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg
                  className="h-6 w-6"
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
              </button>
            </div>
            <div className="p-6">
              <WelcomeForm onSubmit={handleWelcomeFormSubmit} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageAccount;
