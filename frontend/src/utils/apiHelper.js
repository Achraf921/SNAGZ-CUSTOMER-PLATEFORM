/**
 * API Helper Utility
 * Provides consistent API URL generation for both development and production
 */

/**
 * Get the base API URL based on current environment
 * @returns {string} The base API URL
 */
export const getApiBaseUrl = () => {
  // In development, use the current origin (which will be https://localhost:3000)
  // In production, this will automatically use the correct domain
  return window.location.origin;
};

/**
 * Create a full API URL for internal endpoints
 * @param {string} endpoint - The endpoint path (e.g., "/clients/123")
 * @returns {string} The complete API URL
 */
export const getInternalApiUrl = (endpoint) => {
  const baseUrl = getApiBaseUrl();
  // Ensure endpoint starts with a slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}/api/internal${cleanEndpoint}`;
};

/**
 * Create a full API URL for customer endpoints
 * @param {string} endpoint - The endpoint path (e.g., "/shops/123")
 * @returns {string} The complete API URL
 */
export const getCustomerApiUrl = (endpoint) => {
  const baseUrl = getApiBaseUrl();
  // Ensure endpoint starts with a slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}/api/customer${cleanEndpoint}`;
};

/**
 * Standard fetch options for API calls
 */
export const defaultFetchOptions = {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  },
  credentials: 'include',
};

/**
 * Helper function for making API calls with consistent error handling
 * @param {string} url - The API URL
 * @param {object} options - Fetch options
 * @returns {Promise<object>} The response data
 */
export const apiCall = async (url, options = {}) => {
  const response = await fetch(url, {
    ...defaultFetchOptions,
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};