import React, { useState } from "react";

function SetNewPasswordForm({
  username,
  session,
  portalType,
  onPasswordSet,
  onCancel,
  cognitoChallengeParameters,
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const getCompletePasswordEndpoint = () => {
    switch (portalType) {
      case "client":
        return "/complete-new-password-client";
      case "internal":
        return "/complete-new-password-internal";
      case "admin":
        return "/complete-new-password-admin";
      default:
        console.error("Type de portail invalide:", portalType);
        return null;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (!newPassword) {
      setError("Le nouveau mot de passe ne peut pas être vide.");
      return;
    }

    // Basic password policy (you might want to make this more sophisticated or get it from cognitoChallengeParameters.requiredAttributes)
    // Example: At least 8 characters, one uppercase, one lowercase, one number, one special character
    const passwordPolicyRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordPolicyRegex.test(newPassword)) {
      setError(
        "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial."
      );
      return;
    }

    const endpoint = getCompletePasswordEndpoint();
    if (!endpoint) {
      setError("Erreur de configuration.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          newPassword,
          session,
          //Potentially add other required attributes from cognitoChallengeParameters if needed by your Cognito setup for NEW_PASSWORD_REQUIRED
          // 'requiredAttributes': { ... }
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log("New password set successfully for:", username);

        // Set the flag to indicate this is the first login after password change
        // This will be used to show the welcome form on the dashboard
        sessionStorage.setItem("isFirstLogin", "true");

        // Store the userId in sessionStorage and localStorage for persistence
        // This will be used to associate the welcome form submission with this user
        // In a real implementation, you would get the actual userId from your authentication system
        // For now, we'll create a simple userId based on the username
        const userId = `user_${username
          .replace(/[^a-zA-Z0-9]/g, "_")
          .toLowerCase()}`;
        sessionStorage.setItem("userId", userId);
        localStorage.setItem("userId", userId);

        if (onPasswordSet) {
          onPasswordSet(data.redirectUrl); // Call the callback to handle redirect
        } else {
          // Fallback redirect if onPasswordSet is not provided, though it should be.
          window.location.href = data.redirectUrl || "/";
        }
      } else {
        setError(
          data.message || "Échec de la définition du nouveau mot de passe."
        );
      }
    } catch (err) {
      console.error(
        "Erreur lors de la définition du nouveau mot de passe:",
        err
      );
      setError("Une erreur inattendue s'est produite.");
    }
    setIsLoading(false);
  };

  // You might want to parse cognitoChallengeParameters.requiredAttributes to display more specific info
  // For example, `cognitoChallengeParameters.requiredAttributes` might contain `["userAttributes.email", "userAttributes.phone_number"]`
  // if Cognito requires these attributes to be verified/updated during the NEW_PASSWORD_REQUIRED flow.
  // For now, we focus on the password itself.

  return (
    <div className="min-h-screen w-full bg-gray-100 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Définir un nouveau mot de passe
        </h2>
        <p className="text-center text-sm text-gray-600 mb-6">
          Bienvenue, {username} ! Veuillez définir un nouveau mot de passe pour
          continuer.
        </p>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor={`${portalType}-new-password`}
              className="block text-sm font-medium text-gray-700"
            >
              Nouveau mot de passe
            </label>
            <div className="mt-1">
              <input
                type="password"
                id={`${portalType}-new-password`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor={`${portalType}-confirm-password`}
              className="block text-sm font-medium text-gray-700"
            >
              Confirmer le nouveau mot de passe
            </label>
            <div className="mt-1">
              <input
                type="password"
                id={`${portalType}-confirm-password`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
              />
            </div>
          </div>

          {error && (
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
              role="alert"
            >
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary disabled:opacity-50"
            >
              {isLoading ? "Définition en cours..." : "Définir le mot de passe"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="w-full sm:w-auto justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
          <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Le mot de passe doit respecter les exigences suivantes :
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>Au moins 8 caractères</li>
              <li>Au moins une lettre majuscule (A-Z)</li>
              <li>Au moins une lettre minuscule (a-z)</li>
              <li>Au moins un chiffre (0-9)</li>
              <li>Au moins un caractère spécial (ex : !@#$%^&*)</li>
            </ul>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SetNewPasswordForm;
