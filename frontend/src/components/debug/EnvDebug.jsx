import React from "react";

const EnvDebug = () => {
  const recaptchaKey = process.env.REACT_APP_RECAPTCHA_SITE_KEY;
  const supportEmail = process.env.REACT_APP_SUPPORT_EMAIL;
  const nodeEnv = process.env.NODE_ENV;

  return (
    <div className="fixed top-4 right-4 bg-black text-white p-4 rounded-lg text-xs z-50 max-w-sm">
      <h3 className="font-bold mb-2">🔍 Environment Debug</h3>
      <div className="space-y-1">
        <div>
          <strong>NODE_ENV:</strong> {nodeEnv || "undefined"}
        </div>
        <div>
          <strong>RECAPTCHA_KEY:</strong>
          <br />
          <span className="text-green-400">
            {recaptchaKey ? `${recaptchaKey.substring(0, 20)}...` : "undefined"}
          </span>
        </div>
        <div>
          <strong>SUPPORT_EMAIL:</strong>
          <br />
          <span className="text-blue-400">{supportEmail || "undefined"}</span>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-600">
          <div>
            <strong>Has Valid Key:</strong>{" "}
            <span
              className={
                recaptchaKey && recaptchaKey.trim() && recaptchaKey.length > 10
                  ? "text-green-400"
                  : "text-red-400"
              }
            >
              {!!(
                recaptchaKey &&
                recaptchaKey.trim() &&
                recaptchaKey.length > 10
              )
                ? "✅ Yes"
                : "❌ No"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvDebug;
