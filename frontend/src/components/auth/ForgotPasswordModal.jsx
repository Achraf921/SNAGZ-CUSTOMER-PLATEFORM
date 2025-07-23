import React, { useState, useRef } from "react";
import ReCaptcha from "../common/ReCaptcha";

const ForgotPasswordModal = ({ isOpen, onClose, portalType = "client" }) => {
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState(portalType);
  const [captchaToken, setCaptchaToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const captchaRef = useRef();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    // Validate inputs
    if (!email.trim()) {
      setError("Veuillez saisir votre adresse email.");
      return;
    }

    if (!email.includes("@")) {
      setError("Veuillez saisir une adresse email valide.");
      return;
    }

    if (!captchaToken) {
      setError("Veuillez compléter la vérification CAPTCHA.");
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl =
        process.env.NODE_ENV === "production"
          ? "/api/password-reset/request"
          : "http://localhost:3001/api/password-reset/request";

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          userType: userType,
          captchaToken: captchaToken,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(
          data.message || "Email de réinitialisation envoyé avec succès."
        );
        setEmail("");
        setCaptchaToken("");
        if (captchaRef.current) {
          captchaRef.current.reset();
        }
      } else {
        setError(
          data.message || "Une erreur s'est produite. Veuillez réessayer."
        );
      }
    } catch (error) {
      console.error("Error requesting password reset:", error);
      setError(
        "Erreur de connexion. Veuillez vérifier votre connexion internet et réessayer."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCaptchaVerify = (token) => {
    setCaptchaToken(token);
    setError("");
  };

  const handleCaptchaExpired = () => {
    setCaptchaToken("");
  };

  const handleCaptchaError = () => {
    setError("Erreur lors de la vérification CAPTCHA. Veuillez réessayer.");
    setCaptchaToken("");
  };

  const handleClose = () => {
    setEmail("");
    setUserType(portalType);
    setCaptchaToken("");
    setMessage("");
    setError("");
    setIsLoading(false);
    if (captchaRef.current) {
      captchaRef.current.reset();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Mot de passe oublié
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type de compte
              </label>
              <select
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
              >
                <option value="client">Client</option>
                <option value="internal">Personnel interne</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>

            {/* Email Input */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Adresse email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="votre@email.com"
                disabled={isLoading}
                required
              />
            </div>

            {/* reCAPTCHA */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vérification de sécurité
              </label>
              <ReCaptcha
                ref={captchaRef}
                onVerify={handleCaptchaVerify}
                onExpired={handleCaptchaExpired}
                onError={handleCaptchaError}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
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
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {message && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-green-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-800">{message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex items-center justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isLoading || !email.trim() || !captchaToken}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Envoi en cours...
                  </div>
                ) : (
                  "Envoyer le lien"
                )}
              </button>
            </div>
          </form>

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Un lien de réinitialisation sera envoyé à votre adresse email.
              <br />
              Le lien est valable pendant 1 heure.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
