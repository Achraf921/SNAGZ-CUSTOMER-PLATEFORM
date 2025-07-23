import React, { forwardRef, useEffect, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const ReCaptcha = forwardRef(
  ({ onVerify, onExpired, onError, className = "" }, ref) => {
    const siteKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;
    const [captchaError, setCaptchaError] = useState(null);
    const [isDevelopmentMode, setIsDevelopmentMode] = useState(false);

    // Debug the site key
    console.log("reCAPTCHA Configuration:", {
      siteKey: siteKey,
      hasValidKey: !!(siteKey && siteKey.trim() && siteKey.length > 10),
      isDevelopmentMode: isDevelopmentMode,
      nodeEnv: process.env.NODE_ENV,
    });

    // Only auto-verify if site key is truly missing or empty (not in development mode anymore)
    useEffect(() => {
      if ((!siteKey || siteKey.trim() === "") && onVerify) {
        console.log(
          "🔧 reCAPTCHA not configured: Auto-completing CAPTCHA verification"
        );
        // Simulate CAPTCHA success with a fake token
        onVerify("development-bypass-token");
      }
    }, [siteKey, onVerify]);

    const handleCaptchaError = (error) => {
      console.error("❌ reCAPTCHA error:", error);
      setCaptchaError(error);

      // In development, auto-bypass on error
      if (process.env.NODE_ENV === "development") {
        console.log("🔧 Development mode: Bypassing CAPTCHA due to error");
        setIsDevelopmentMode(true);
      }

      if (onError) {
        onError(error);
      }
    };

    const handleCaptchaLoad = () => {
      console.log("✅ reCAPTCHA loaded successfully");
      setCaptchaError(null);
    };

    const handleRetry = () => {
      setCaptchaError(null);
      setIsDevelopmentMode(false);
    };

    // Handle empty or invalid site key
    if (!siteKey || siteKey.trim() === "") {
      console.warn("reCAPTCHA site key not configured or empty.");
      return (
        <div
          className={`bg-blue-50 border border-blue-200 rounded-lg p-3 ${className}`}
        >
          <div className="flex items-center">
            <div className="mr-2">🔧</div>
            <div>
              <p className="text-blue-700 text-sm font-medium">
                Mode développement - CAPTCHA simulé
              </p>
              <p className="text-blue-600 text-xs mt-1">
                Configurez REACT_APP_RECAPTCHA_SITE_KEY pour activer le CAPTCHA
                réel
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Show development bypass if there was an error
    if (isDevelopmentMode || captchaError) {
      return (
        <div
          className={`bg-orange-50 border border-orange-200 rounded-lg p-3 ${className}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="mr-2">⚠️</div>
              <div>
                <p className="text-orange-700 text-sm font-medium">
                  CAPTCHA en mode bypass
                </p>
                <p className="text-orange-600 text-xs mt-1">
                  {captchaError
                    ? `Erreur CAPTCHA - Vérification automatique activée`
                    : "Vérification automatique en mode développement"}
                </p>
              </div>
            </div>
            <button
              onClick={handleRetry}
              className="text-orange-600 text-xs underline hover:text-orange-700"
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex justify-center ${className}`}>
        <div className="w-full">
          <ReCAPTCHA
            ref={ref}
            sitekey={siteKey}
            onChange={onVerify}
            onExpired={onExpired}
            onError={handleCaptchaError}
            onLoad={handleCaptchaLoad}
            theme="light"
            size="normal"
          />
          {process.env.NODE_ENV === "development" && (
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-500">🔍 reCAPTCHA configuré</p>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ReCaptcha.displayName = "ReCaptcha";

export default ReCaptcha;
