/**
 * Validation Utilities
 * Common validation functions for the application
 */

/**
 * Validate required field
 * @param {*} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Object} Validation result
 */
export function validateRequired(value, fieldName) {
    if (value === null || value === undefined || value === '') {
        return {
            isValid: false,
            error: `${fieldName} is required`
        };
    }
    
    if (typeof value === 'string' && value.trim() === '') {
        return {
            isValid: false,
            error: `${fieldName} is required`
        };
    }
    
    return { isValid: true, error: null };
}

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum length
 * @param {number} options.max - Maximum length
 * @returns {Object} Validation result
 */
export function validateLength(value, fieldName, { min = 0, max = Infinity } = {}) {
    if (value === null || value === undefined) {
        return { isValid: true, error: null }; // Use validateRequired for required fields
    }
    
    const strValue = String(value);
    const length = strValue.length;
    
    if (length < min) {
        return {
            isValid: false,
            error: `${fieldName} must be at least ${min} characters`
        };
    }
    
    if (length > max) {
        return {
            isValid: false,
            error: `${fieldName} must be ${max} characters or less`
        };
    }
    
    return { isValid: true, error: null };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Object} Validation result
 */
export function validateEmail(email, fieldName = 'Email') {
    if (!email) {
        return { isValid: true, error: null }; // Use validateRequired for required emails
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return {
            isValid: false,
            error: `${fieldName} is not a valid email address`
        };
    }
    
    return { isValid: true, error: null };
}

/**
 * Validate date format
 * @param {string} date - Date string to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {string} expectedFormat - Expected date format
 * @returns {Object} Validation result
 */
export function validateDate(date, fieldName = 'Date', expectedFormat = 'YYYY-MM-DD') {
    if (!date) {
        return { isValid: true, error: null }; // Use validateRequired for required dates
    }
    
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        return {
            isValid: false,
            error: `${fieldName} is not a valid date`
        };
    }
    
    // Additional format validation based on expected format
    if (expectedFormat === 'YYYY-MM-DD') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return {
                isValid: false,
                error: `${fieldName} must be in YYYY-MM-DD format`
            };
        }
    }
    
    return { isValid: true, error: null };
}

/**
 * Validate time format
 * @param {string} time - Time string to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {Object} Validation result
 */
export function validateTime(time, fieldName = 'Time') {
    if (!time) {
        return { isValid: true, error: null };
    }
    
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
        return {
            isValid: false,
            error: `${fieldName} must be in HH:mm format`
        };
    }
    
    return { isValid: true, error: null };
}

/**
 * Validate number
 * @param {*} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {boolean} options.integer - Whether value must be integer
 * @returns {Object} Validation result
 */
export function validateNumber(value, fieldName, { min = -Infinity, max = Infinity, integer = false } = {}) {
    if (value === null || value === undefined || value === '') {
        return { isValid: true, error: null }; // Use validateRequired for required fields
    }
    
    const numValue = Number(value);
    
    if (isNaN(numValue)) {
        return {
            isValid: false,
            error: `${fieldName} must be a number`
        };
    }
    
    if (integer && !Number.isInteger(numValue)) {
        return {
            isValid: false,
            error: `${fieldName} must be an integer`
        };
    }
    
    if (numValue < min) {
        return {
            isValid: false,
            error: `${fieldName} must be at least ${min}`
        };
    }
    
    if (numValue > max) {
        return {
            isValid: false,
            error: `${fieldName} must be ${max} or less`
        };
    }
    
    return { isValid: true, error: null };
}

/**
 * Validate selection from allowed values
 * @param {*} value - Value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {Array} allowedValues - Array of allowed values
 * @returns {Object} Validation result
 */
export function validateSelection(value, fieldName, allowedValues) {
    if (!value && !allowedValues.includes(null) && !allowedValues.includes(undefined) && !allowedValues.includes('')) {
        return {
            isValid: false,
            error: `${fieldName} is required`
        };
    }
    
    if (!allowedValues.includes(value)) {
        return {
            isValid: false,
            error: `${fieldName} is not a valid selection`
        };
    }
    
    return { isValid: true, error: null };
}

/**
 * Validate multiple fields
 * @param {Object} values - Object with field values
 * @param {Object} rules - Object with validation rules per field
 * @returns {Object} Validation result with isValid and errors
 */
export function validateForm(values, rules) {
    const errors = {};
    let isValid = true;
    
    for (const [fieldName, fieldRules] of Object.entries(rules)) {
        const value = values[fieldName];
        
        // Apply all validation rules for this field
        for (const rule of fieldRules) {
            const result = validateField(value, fieldName, rule);
            if (!result.isValid) {
                errors[fieldName] = result.error;
                isValid = false;
                break; // Only show first error per field
            }
        }
    }
    
    return { isValid, errors };
}

/**
 * Validate a single field with a validation rule
 * @param {*} value - Field value
 * @param {string} fieldName - Field name for error messages
 * @param {Object} rule - Validation rule
 * @returns {Object} Validation result
 */
function validateField(value, fieldName, rule) {
    switch (rule.type) {
        case 'required':
            return validateRequired(value, fieldName);
        case 'length':
            return validateLength(value, fieldName, rule.options);
        case 'email':
            return validateEmail(value, fieldName);
        case 'date':
            return validateDate(value, fieldName, rule.format);
        case 'time':
            return validateTime(value, fieldName);
        case 'number':
            return validateNumber(value, fieldName, rule.options);
        case 'selection':
            return validateSelection(value, fieldName, rule.allowedValues);
        default:
            return { isValid: true, error: null };
    }
}

/**
 * Create a validation schema
 * @param {Object} schema - Schema definition
 * @returns {Object} Validation functions
 */
export function createValidator(schema) {
    return {
        validate: (values) => validateForm(values, schema),
        validateField: (fieldName, value) => {
            const fieldRules = schema[fieldName];
            if (!fieldRules) return { isValid: true, error: null };
            
            for (const rule of fieldRules) {
                const result = validateField(value, fieldName, rule);
                if (!result.isValid) return result;
            }
            
            return { isValid: true, error: null };
        }
    };
}

export default {
    validateRequired,
    validateLength,
    validateEmail,
    validateDate,
    validateTime,
    validateNumber,
    validateSelection,
    validateForm,
    createValidator
};