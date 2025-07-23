const validateUserId = (req, res, next) => {
  const userId = req.params.userId;
  
  // Critical security validation
  if (!userId || userId === 'undefined' || userId === 'null' || userId.trim() === '') {
    console.error('🚨 SECURITY ALERT: Invalid userId in request:', {
      path: req.path,
      userId: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(400).json({
      success: false,
      message: 'Invalid user identifier',
      securityAlert: 'Invalid userId provided'
    });
  }
  
  // Validate userId format (Cognito sub format)
  if (typeof userId !== 'string' || userId.length < 10) {
    console.error('🚨 SECURITY ALERT: Suspicious userId format:', {
      path: req.path,
      userId: userId,
      type: typeof userId,
      length: userId.length,
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      message: 'Invalid user identifier format',
      securityAlert: 'Suspicious userId format'
    });
  }
  
  console.log('✅ SECURITY: UserId validation passed for:', req.path);
  next();
};

const logCustomerAccess = (customer, requestedUserId, req) => {
  console.log('🔍 CUSTOMER ACCESS LOG:', {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    requestedUserId: requestedUserId,
    foundCustomerId: customer._id,
    foundCustomerUserId: customer.userId,
    customerName: customer.raisonSociale || 'N/A',
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    isValidAccess: customer.userId === requestedUserId
  });
  
  // Critical security check
  if (customer.userId !== requestedUserId) {
    console.error('🚨 CRITICAL SECURITY BREACH: Customer userId mismatch!');
    console.error('This indicates a serious privacy leak - user accessing wrong customer data');
    throw new Error('SECURITY_BREACH_CUSTOMER_MISMATCH');
  }
};

module.exports = {
  validateUserId,
  logCustomerAccess
}; 