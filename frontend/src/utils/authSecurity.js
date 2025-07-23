// Frontend security utilities to prevent privacy leaks and session contamination

// Clear all authentication data completely
export const clearAllAuthData = () => {
  console.log('🧹 SECURITY: Clearing all authentication data');
  
  // Clear localStorage
  const localStorageKeys = [
    'userInfo', 'userId', 'token', 'userRole', 'userEmail',
    'hasCompletedWelcomeForm', 'isFirstLogin'
  ];
  
  localStorageKeys.forEach(key => {
    if (localStorage.getItem(key)) {
      console.log(`🗑️ Clearing localStorage: ${key}`);
      localStorage.removeItem(key);
    }
  });
  
  // Clear sessionStorage
  const sessionStorageKeys = [
    'userInfo', 'userId', 'token', 'userRole', 'userEmail',
    'hasCompletedWelcomeForm', 'isFirstLogin'
  ];
  
  sessionStorageKeys.forEach(key => {
    if (sessionStorage.getItem(key)) {
      console.log(`🗑️ Clearing sessionStorage: ${key}`);
      sessionStorage.removeItem(key);
    }
  });
  
  console.log('✅ SECURITY: All authentication data cleared');
};

// Validate stored user data integrity
export const validateStoredUserData = () => {
  console.log('🔒 SECURITY: Validating stored user data');
  
  try {
    // Check localStorage userInfo
    const localUserInfo = localStorage.getItem('userInfo');
    const sessionUserInfo = sessionStorage.getItem('userInfo');
    
    let parsedLocalUserInfo = null;
    let parsedSessionUserInfo = null;
    
    if (localUserInfo) {
      try {
        parsedLocalUserInfo = JSON.parse(localUserInfo);
      } catch (error) {
        console.error('🚨 SECURITY: Corrupted localStorage userInfo, clearing...');
        localStorage.removeItem('userInfo');
      }
    }
    
    if (sessionUserInfo) {
      try {
        parsedSessionUserInfo = JSON.parse(sessionUserInfo);
      } catch (error) {
        console.error('🚨 SECURITY: Corrupted sessionStorage userInfo, clearing...');
        sessionStorage.removeItem('userInfo');
      }
    }
    
    // Validate required fields
    if (parsedLocalUserInfo) {
      if (!parsedLocalUserInfo.sub || !parsedLocalUserInfo.email) {
        console.error('🚨 SECURITY: Invalid userInfo in localStorage (missing sub/email), clearing...');
        clearAllAuthData();
        return false;
      }
    }
    
    if (parsedSessionUserInfo) {
      if (!parsedSessionUserInfo.sub || !parsedSessionUserInfo.email) {
        console.error('🚨 SECURITY: Invalid userInfo in sessionStorage (missing sub/email), clearing...');
        clearAllAuthData();
        return false;
      }
    }
    
    // Check for consistency between localStorage and sessionStorage
    if (parsedLocalUserInfo && parsedSessionUserInfo) {
      if (parsedLocalUserInfo.sub !== parsedSessionUserInfo.sub) {
        console.error('🚨 SECURITY: User data mismatch between localStorage and sessionStorage!');
        console.error('localStorage sub:', parsedLocalUserInfo.sub);
        console.error('sessionStorage sub:', parsedSessionUserInfo.sub);
        clearAllAuthData();
        return false;
      }
    }
    
    console.log('✅ SECURITY: Stored user data validation passed');
    return true;
    
  } catch (error) {
    console.error('🚨 SECURITY: Error validating stored data:', error);
    clearAllAuthData();
    return false;
  }
};

// Secure user data storage with validation
export const secureStoreUserData = (userInfo) => {
  console.log('🔒 SECURITY: Securely storing user data');
  
  // Validate required fields
  if (!userInfo.sub || !userInfo.email) {
    console.error('🚨 SECURITY: Cannot store invalid userInfo (missing sub/email)');
    throw new Error('Invalid user data: missing required fields');
  }
  
  // Clear any existing data first
  clearAllAuthData();
  
  // Store validated data
  const sanitizedUserInfo = {
    sub: userInfo.sub,
    email: userInfo.email,
    username: userInfo.username,
    name: userInfo.name || '',
    userId: userInfo.sub, // Always use sub as userId
    timestamp: new Date().toISOString()
  };
  
  console.log('💾 SECURITY: Storing sanitized user data:', {
    sub: sanitizedUserInfo.sub,
    email: sanitizedUserInfo.email,
    username: sanitizedUserInfo.username
  });
  
  localStorage.setItem('userInfo', JSON.stringify(sanitizedUserInfo));
  sessionStorage.setItem('userInfo', JSON.stringify(sanitizedUserInfo));
  localStorage.setItem('userId', sanitizedUserInfo.sub);
  sessionStorage.setItem('userId', sanitizedUserInfo.sub);
  
  console.log('✅ SECURITY: User data stored securely');
};

// Get validated user data
export const getValidatedUserData = () => {
  if (!validateStoredUserData()) {
    return null;
  }
  
  try {
    const userInfoStr = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo');
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr);
      
      console.log('📖 SECURITY: Retrieved validated user data:', {
        sub: userInfo.sub,
        email: userInfo.email,
        hasUserId: !!userInfo.userId
      });
      
      return userInfo;
    }
  } catch (error) {
    console.error('🚨 SECURITY: Error retrieving user data:', error);
    clearAllAuthData();
  }
  
  return null;
};

// Security check before making API calls
export const validateApiRequest = (userId) => {
  const userData = getValidatedUserData();
  
  if (!userData) {
    console.error('🚨 SECURITY: No valid user data for API request');
    return false;
  }
  
  if (userData.sub !== userId && userData.userId !== userId) {
    console.error('🚨 SECURITY: API request userId mismatch!');
    console.error('Stored userId:', userData.sub);
    console.error('Request userId:', userId);
    clearAllAuthData();
    return false;
  }
  
  console.log('✅ SECURITY: API request validation passed');
  return true;
}; 