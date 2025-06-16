const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const login = async (type, credentials) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/login-${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Authentication failed');
    }

    const data = await response.json();
    if (data.data.token) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('userRole', type);
      localStorage.setItem('userEmail', credentials.email);
    }
    return data;
  } catch (error) {
    throw error;
  }
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userEmail');
};

export const getToken = () => {
  return localStorage.getItem('token');
};

export const getUserRole = () => {
  return localStorage.getItem('userRole');
};

export const isAuthenticated = () => {
  return !!getToken();
}; 