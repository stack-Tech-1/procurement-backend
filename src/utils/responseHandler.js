// backend/src/utils/responseHandler.js

/**
 * Standardized success response handler
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export const sendSuccess = (res, message, data = null, statusCode = 200) => {
    const response = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    return res.status(statusCode).json(response);
  };
  
  /**
   * Standardized error response handler
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {Object} error - Original error object (optional)
   */
  export const sendError = (res, message, statusCode = 500, error = null) => {
    const response = {
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' && error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined,
      timestamp: new Date().toISOString()
    };
    
    return res.status(statusCode).json(response);
  };
  
  /**
   * Standardized validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Validation errors array
   */
  export const sendValidationError = (res, errors) => {
    const response = {
      success: false,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    };
    
    return res.status(400).json(response);
  };
  
  /**
   * Standardized not found response
   * @param {Object} res - Express response object
   * @param {string} resource - Resource name that wasn't found
   */
  export const sendNotFound = (res, resource = 'Resource') => {
    const response = {
      success: false,
      message: `${resource} not found`,
      timestamp: new Date().toISOString()
    };
    
    return res.status(404).json(response);
  };
  
  /**
   * Standardized unauthorized response
   * @param {Object} res - Express response object
   * @param {string} message - Unauthorized message
   */
  export const sendUnauthorized = (res, message = 'Unauthorized access') => {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };
    
    return res.status(401).json(response);
  };
  
  /**
   * Standardized forbidden response
   * @param {Object} res - Express response object
   * @param {string} message - Forbidden message
   */
  export const sendForbidden = (res, message = 'Access forbidden') => {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };
    
    return res.status(403).json(response);
  };
  
  export default {
    sendSuccess,
    sendError,
    sendValidationError,
    sendNotFound,
    sendUnauthorized,
    sendForbidden
  };