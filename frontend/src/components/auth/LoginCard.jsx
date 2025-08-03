import React, { useState, useRef } from "react";
import SetNewPasswordForm from "./SetNewPasswordForm"; // Will be refactored to Tailwind later
import ForgotPasswordModal from "./ForgotPasswordModal";
import ReCaptcha from "../common/ReCaptcha";

function LoginCard({
  portalTitle,
  loginApiEndpoint,
  portalType, // 'client', 'internal', or 'admin'
  defaultRedirectUrl,
  showMainMenu,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef();

  // State for NEW_PASSWORD_REQUIRED challenge
  const [showNewPasswordForm, setShowNewPasswordForm] = useState(false);
  const [challengeSession, setChallengeSession] = useState(null);
  const [challengeUsername, setChallengeUsername] = useState(null);
  const [cognitoChallengeParameters, setCognitoChallengeParameters] =
    useState(null);

  // State for forgot password modal
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    // Don't clear error state immediately - we'll handle it after processing the response
    // setError("");

    // Validate CAPTCHA
    if (!captchaToken) {
      setError("Veuillez compléter la vérification CAPTCHA.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(loginApiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          captchaToken,
        }),
      });

      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        setError("Erreur de réponse du serveur. Veuillez réessayer.");
        setIsLoading(false);
        return;
      }
      setIsLoading(false);

      // Handle error responses first
      if (!response.ok) {
        const errorMessage =
          data.message ||
          "Échec de l'authentification. Veuillez vérifier vos identifiants.";
        setError(errorMessage);
        // Reset CAPTCHA on error but don't clear the error state
        if (captchaRef.current) {
          captchaRef.current.reset();
          setCaptchaToken("");
        }
        return;
      }

      if (data.success) {
        // SECURITY: Securely store user data with validation
        if (data.userInfo) {
          // Import security utilities
          const { secureStoreUserData } = await import(
            "../../utils/authSecurity"
          );

          try {
            // Securely store with validation
            secureStoreUserData(data.userInfo);
          } catch (error) {
            setError(
              "Security validation failed. Please try logging in again."
            );
            return;
          }
        } else {
          setError("Invalid login response. Please try again.");
          return;
        }
        // Use the redirect URL from the server response
        if (data.redirectUrl) {
          // Use window.location.replace for proper session handling
          window.location.replace(data.redirectUrl);
        } else {
          // Fallback to default redirect URL
          window.location.replace(defaultRedirectUrl);
        }
      } else if (
        response.ok &&
        data.challengeName === "NEW_PASSWORD_REQUIRED"
      ) {
        setChallengeUsername(data.username);
        setChallengeSession(data.session);
        setCognitoChallengeParameters(data.challengeParameters);
        setShowNewPasswordForm(true);
      } else {
        setError(
          data.message ||
            "Échec de l'authentification. Veuillez vérifier vos identifiants."
        );
      }
    } catch (err) {
      setIsLoading(false);

      // Provide more specific error messages based on the error type
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        setError(
          "Erreur de connexion au serveur. Veuillez vérifier votre connexion internet."
        );
      } else if (err.name === "SyntaxError") {
        setError("Erreur de réponse du serveur. Veuillez réessayer.");
      } else {
        setError(
          "Une erreur inattendue s'est produite. Veuillez réessayer plus tard."
        );
      }

      // Reset CAPTCHA on error
      if (captchaRef.current) {
        captchaRef.current.reset();
        setCaptchaToken("");
      }
    }
  };

  const handleCaptchaVerify = (token) => {
    setCaptchaToken(token);
    // Only clear CAPTCHA-specific errors, not authentication errors
    // setError(""); // Clear any previous CAPTCHA errors
  };

  const handleCaptchaExpired = () => {
    setCaptchaToken("");
    setError("La vérification CAPTCHA a expiré. Veuillez la recommencer.");
  };

  const handleCaptchaError = () => {
    setCaptchaToken("");
    setError("Erreur lors de la vérification CAPTCHA. Veuillez réessayer.");
  };

  const handlePasswordSet = (redirectUrl) => {
    // For internal and admin portals, redirect back to their login pages
    // For client portal, use the redirectUrl from backend (which goes to dashboard)
    if (portalType === "internal") {
      window.location.href = "/?portal=internal";
    } else if (portalType === "admin") {
      window.location.href = "/?portal=admin";
    } else {
      // Client portal - use the redirectUrl from backend
      window.location.href = redirectUrl || defaultRedirectUrl;
    }
  };

  const handleCancelSetPassword = () => {
    setShowNewPasswordForm(false);
    // Don't clear error state when canceling password set
    // setError("");
    // Optionally clear form fields or call showMainMenu directly
    // setEmail('');
    // setPassword('');
    // if (showMainMenu) showMainMenu();
  };

  if (showNewPasswordForm) {
    return (
      <SetNewPasswordForm
        username={challengeUsername}
        session={challengeSession}
        portalType={portalType}
        onPasswordSet={handlePasswordSet}
        onCancel={handleCancelSetPassword}
        cognitoChallengeParameters={cognitoChallengeParameters}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-gray-100 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-6">
          {portalTitle}
        </h2>
        <form onSubmit={handleLoginSubmit} className="space-y-6">
          <div>
            <label
              htmlFor={`${portalType}-email`}
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <div className="mt-1">
              <input
                id={`${portalType}-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${portalType}-password`}
              className="block text-sm font-medium text-gray-700"
            >
              Mot de passe
            </label>
            <div className="mt-1 relative">
              <input
                id={`${portalType}-password`}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-sna-primary focus:border-sna-primary sm:text-sm"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowPassword(true);
                }}
                onMouseUp={() => setShowPassword(false)}
                onMouseLeave={() => setShowPassword(false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setShowPassword(true);
                }}
                onTouchEnd={() => setShowPassword(false)}
              >
                <svg
                  className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  {showPassword ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* reCAPTCHA */}
          <div>
            <ReCaptcha
              ref={captchaRef}
              onVerify={handleCaptchaVerify}
              onExpired={handleCaptchaExpired}
              onError={handleCaptchaError}
              className="mb-4"
            />
          </div>

          {error && (
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
              role="alert"
            >
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading || !captchaToken}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary disabled:opacity-50"
            >
              {isLoading ? "Connexion..." : "Se connecter"}
            </button>
          </div>

          {/* Forgot Password Link */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(true)}
              className="text-sm text-sna-primary hover:text-sna-primary/90 underline"
              disabled={isLoading}
            >
              Mot de passe oublié ?
            </button>
          </div>
        </form>
        {showMainMenu && (
          <div className="mt-6">
            <button
              onClick={showMainMenu}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
            >
              Retourner au menu
            </button>
          </div>
        )}
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
        portalType={portalType}
      />
    </div>
  );
}

export default LoginCard;
