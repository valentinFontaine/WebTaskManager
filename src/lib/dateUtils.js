/**
 * Date utility functions for TaskWarrior Web UI
 */

/**
 * Format a date string for display
 * @param {string|null} dateString - ISO date string or null
 * @param {string} format - Intl.DateTimeFormat format options
 * @returns {string} - Formatted date or empty string
 */
export function formatDate(dateString, format = { dateStyle: 'medium' }) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', format).format(date);
  } catch (e) {
    return dateString;
  }
}

/**
 * Format a date for TaskWarrior command input
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} - Formatted date string for TaskWarrior
 */
export function formatDateForTaskWarrior(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  // TaskWarrior expects dates like: 20240115T120000Z
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Get the current date in YYYY-MM-DD format
 * @returns {string}
 */
export function getCurrentDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get date N days from now
 * @param {number} days - Number of days from now
 * @returns {Date}
 */
export function getDateFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Check if a date is today
 * @param {string} dateString - ISO date string
 * @returns {boolean}
 */
export function isToday(dateString) {
  if (!dateString) return false;
  const today = new Date();
  const inputDate = new Date(dateString);
  return inputDate.toDateString() === today.toDateString();
}

/**
 * Check if a date is overdue (before today)
 * @param {string} dateString - ISO date string
 * @returns {boolean}
 */
export function isOverdue(dateString) {
  if (!dateString) return false;
  const today = new Date();
  const inputDate = new Date(dateString);
  return inputDate < today && inputDate.toDateString() !== today.toDateString();
}

/**
 * Check if a date is in the future
 * @param {string} dateString - ISO date string
 * @returns {boolean}
 */
export function isFuture(dateString) {
  if (!dateString) return false;
  const today = new Date();
  const inputDate = new Date(dateString);
  return inputDate > today;
}

/**
 * Parse a date string to Date object
 * @param {string} dateString - Various date formats
 * @returns {Date|null}
 */
export function parseDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get the difference in days between two dates
 * @param {string|Date} date1
 * @param {string|Date} date2
 * @returns {number}
 */
export function getDaysDifference(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format a date range for display
 * @param {string} startDate
 * @param {string} endDate
 * @returns {string}
 */
export function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return '';
  if (!startDate) return `Until ${formatDate(endDate)}`;
  if (!endDate) return `Since ${formatDate(startDate)}`;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // If same year and month, just show day range
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    const startDay = start.getDate();
    const endDay = end.getDate();
    const monthName = start.toLocaleString('default', { month: 'short' });
    return `${monthName} ${startDay}-${endDay}, ${start.getFullYear()}`;
  }
  
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

export default {
  formatDate,
  formatDateForTaskWarrior,
  getCurrentDate,
  getDateFromNow,
  isToday,
  isOverdue,
  isFuture,
  parseDate,
  getDaysDifference,
  formatDateRange
};
