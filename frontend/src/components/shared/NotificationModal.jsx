import React from "react";

/**
 * Generic modal for confirmations, success or error messages.
 *
 * Props:
 *  - open (bool): whether the modal is shown
 *  - type ("confirmation" | "success" | "error"): controls icon and buttons
 *  - title (string): optional heading
 *  - message (string | ReactNode)
 *  - onClose (): called when user clicks close button (for success/error) or cancel
 *  - onConfirm (): called when user confirms (confirmation type only)
 */
const NotificationModal = ({
  open,
  type = "success",
  title,
  message,
  onClose,
  onConfirm,
}) => {
  if (!open) return null;

  const renderIcon = () => {
    if (type === "success") {
      return (
        <svg
          className="h-6 w-6 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      );
    }
    if (type === "error") {
      return (
        <svg
          className="h-6 w-6 text-red-600"
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
      );
    }
    // confirmation icon
    return (
      <svg
        className="h-6 w-6 text-sna-primary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M13 16h-1v-4h-1m0-4h.01M12 18a6 6 0 100-12 6 6 0 000 12z"
        />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[99999] p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-lg">
        <div className="text-center space-y-4">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100">
            {renderIcon()}
          </div>
          {title && (
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          )}
          {message && (
            <div className="text-sm text-gray-500 space-y-2">{message}</div>
          )}
          {type === "confirmation" ? (
            <div className="flex justify-center space-x-4 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
              >
                Annuler
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
              >
                Confirmer
              </button>
            </div>
          ) : (
            <div className="pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-sna-primary hover:bg-sna-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sna-primary"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
