/**
 * Date Utilities
 * Helper functions for date formatting and manipulation
 */

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string
 * @returns {string} Formatted date string
 */
export function formatDate(date, format = 'YYYY-MM-DD') {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const pad = (num) => num.toString().padStart(2, '0');
    
    const replacements = {
        'YYYY': d.getFullYear(),
        'MM': pad(d.getMonth() + 1),
        'DD': pad(d.getDate()),
        'HH': pad(d.getHours()),
        'mm': pad(d.getMinutes()),
        'ss': pad(d.getSeconds()),
        'MMM': d.toLocaleString('default', { month: 'short' }),
        'MMMM': d.toLocaleString('default', { month: 'long' }),
        'ddd': d.toLocaleString('default', { weekday: 'short' }),
        'dddd': d.toLocaleString('default', { weekday: 'long' })
    };
    
    let result = format;
    for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(key, 'g'), value);
    }
    
    return result;
}

/**
 * Format date as relative (e.g., "Today", "Tomorrow", "Yesterday", "In 2 days")
 * @param {Date|string} date - Date to format
 * @returns {string} Relative date string
 */
export function formatRelativeDate(date) {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const targetDate = new Date(d);
    targetDate.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`;
    if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`;
    
    return formatDate(d, 'MMM DD, YYYY');
}

/**
 * Format time (HH:mm)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted time string
 */
export function formatTime(date) {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    return formatDate(d, 'HH:mm');
}

/**
 * Format date and time
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date and time string
 */
export function formatDateTime(date) {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    return formatDate(d, 'YYYY-MM-DD HH:mm');
}

/**
 * Get date difference in days
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} Difference in days
 */
export function getDateDifference(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
    
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if date is today
 * @param {Date|string} date - Date to check
 * @returns {boolean} Whether date is today
 */
export function isToday(date) {
    if (!date) return false;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    
    const today = new Date();
    return d.getDate() === today.getDate() && 
           d.getMonth() === today.getMonth() && 
           d.getFullYear() === today.getFullYear();
}

/**
 * Check if date is overdue
 * @param {Date|string} date - Date to check
 * @returns {boolean} Whether date is overdue (in the past)
 */
export function isOverdue(date) {
    if (!date) return false;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return d < today;
}

/**
 * Check if date is within next N days
 * @param {Date|string} date - Date to check
 * @param {number} days - Number of days to check
 * @returns {boolean} Whether date is within next N days
 */
export function isWithinNextDays(date, days = 7) {
    if (!date) return false;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + days);
    
    return d >= today && d <= futureDate;
}

/**
 * Get start of day (00:00:00)
 * @param {Date|string} date - Date to process
 * @returns {Date} Date at start of day
 */
export function getStartOfDay(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return new Date();
    
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get end of day (23:59:59)
 * @param {Date|string} date - Date to process
 * @returns {Date} Date at end of day
 */
export function getEndOfDay(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return new Date();
    
    d.setHours(23, 59, 59, 999);
    return d;
}

/**
 * Parse various date formats into Date object
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} Parsed Date object or null if invalid
 */
export function parseDate(dateString) {
    if (!dateString) return null;
    
    // Try ISO format first
    if (dateString.match(/\d{4}-\d{2}-\d{2}/)) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;
    }
    
    // Try various other formats
    const formats = [
        'YYYY-MM-DD',
        'MM/DD/YYYY',
        'DD/MM/YYYY',
        'MMM DD, YYYY',
        'MMMM DD, YYYY'
    ];
    
    for (const format of formats) {
        // This is a simplified approach - in a real app you might use a library
        try {
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) return date;
        } catch {
            continue;
        }
    }
    
    return null;
}

export default {
    formatDate,
    formatRelativeDate,
    formatTime,
    formatDateTime,
    getDateDifference,
    isToday,
    isOverdue,
    isWithinNextDays,
    getStartOfDay,
    getEndOfDay,
    parseDate
};