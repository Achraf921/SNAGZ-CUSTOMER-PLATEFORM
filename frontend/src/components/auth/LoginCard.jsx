import React, { useState } from "react";
import SetNewPasswordForm from "./SetNewPasswordForm"; // Will be refactored to Tailwind later

function LoginCard({
  portalTitle,
  loginApiEndpoint,
  portalType, // 'client', 'internal', or 'admin'
  defaultRedirectUrl,
  showMainMenu,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // State for NEW_PASSWORD_REQUIRED challenge
  const [showNewPasswordForm, setShowNewPasswordForm] = useState(false);
  const [challengeSession, setChallengeSession] = useState(null);
  const [challengeUsername, setChallengeUsername] = useState(null);
  const [cognitoChallengeParameters, setCognitoChallengeParameters] =
    useState(null);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(loginApiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      setIsLoading(false);

      if (response.ok && data.success) {
        // Store the complete userInfo object in localStorage and sessionStorage
        if (data.userInfo) {
          console.log(`LoginCard (${portalType}): Storing userInfo:`, data.userInfo);
          // Store the entire userInfo object as JSON string
          localStorage.setItem("userInfo", JSON.stringify(data.userInfo));
          sessionStorage.setItem("userInfo", JSON.stringify(data.userInfo));
          
          // Also store userId separately for backward compatibility
          if (data.userInfo.userId) {
            console.log(`LoginCard (${portalType}): Storing userId:`, data.userInfo.userId);
            localStorage.setItem("userId", data.userInfo.userId);
            sessionStorage.setItem("userId", data.userInfo.userId);
          }
          
          // Log the sub attribute for debugging
          if (data.userInfo.sub) {
            console.log(`LoginCard (${portalType}): User sub attribute:`, data.userInfo.sub);
          } else {
            console.warn(`LoginCard (${portalType}): No sub attribute found in userInfo`);
          }
        } else {
          console.warn(`LoginCard (${portalType}): No userInfo found in login response`);
        }
        // Special routing for internal portal: always go to /internal/clients
        if (portalType === 'internal') {
          window.location.href = '/internal/clients';
        } else {
          window.location.href = data.redirectUrl || defaultRedirectUrl;
        }
      } else if (
        response.ok &&
        data.challengeName === "NEW_PASSWORD_REQUIRED"
      ) {
        console.log(
          `LoginCard (${portalType}): Received NEW_PASSWORD_REQUIRED challenge.`
        );
        setChallengeUsername(data.username);
        setChallengeSession(data.session);
        setCognitoChallengeParameters(data.challengeParameters);
        setShowNewPasswordForm(true);
      } else {
        setError(
          data.message || "Login failed. Please check your credentials."
        );
      }
    } catch (err) {
      setIsLoading(false);
      console.error(`Login request failed for ${portalType}:`, err);
      setError("An unexpected error occurred. Please try again later.");
    }
  };

  const handlePasswordSet = (redirectUrl) => {
    console.log(
      `LoginCard (${portalType}): Password set successfully, redirecting...`
    );
    window.location.href = redirectUrl || defaultRedirectUrl;
  };

  const handleCancelSetPassword = () => {
    setShowNewPasswordForm(false);
    setError("");
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
            <div className="mt-1">
              <input
                id={`${portalType}-password`}
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary disabled:opacity-50"
            >
              {isLoading ? "Connexion..." : "Se connecter"}
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
    </div>
  );
}

export default LoginCard;
