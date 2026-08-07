/**
 * Calendar Utility Functions
 * Helper functions for calendar date/time calculations and manipulations
 */

// Constants
const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const MILLISECONDS_IN_MINUTE = 60000;

export const CALENDAR_CONSTANTS = {
    HOUR_START: 8,  // Work day starts at 8 AM
    HOUR_END: 18,   // Work day ends at 6 PM
    TIME_SLOT_HEIGHT: 60, // pixels per hour
    DAY_WIDTH: 150, // pixels per day column
    WEEK_DAYS: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

/**
 * Get the start of the week (Sunday) for a given date
 * @param {Date} date - The input date
 * @returns {Date} - The start of the week (Sunday)
 */
export function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 (Sunday) to 6 (Saturday)
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get the end of the week (Saturday) for a given date
 * @param {Date} date - The input date
 * @returns {Date} - The end of the week (Saturday)
 */
export function getEndOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() + (6 - day));
    d.setHours(23, 59, 59, 999);
    return d;
}

/**
 * Get the start of the day for a given date
 * @param {Date} date - The input date
 * @returns {Date} - The start of the day
 */
export function getStartOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get the end of the day for a given date
 * @param {Date} date - The input date
 * @returns {Date} - The end of the day
 */
export function getEndOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

/**
 * Get all days in a week for a given date
 * @param {Date} date - The input date
 * @returns {Date[]} - Array of dates for each day in the week
 */
export function getDaysInWeek(date) {
    const startOfWeek = getStartOfWeek(date);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        days.push(day);
    }
    return days;
}

/**
 * Get the date range for a week view
 * @param {Date} date - The input date
 * @returns {Object} - Object with start and end dates
 */
export function getWeekRange(date) {
    return {
        start: getStartOfWeek(date),
        end: getEndOfWeek(date)
    };
}

/**
 * Get the date range for a day view
 * @param {Date} date - The input date
 * @returns {Object} - Object with start and end dates
 */
export function getDayRange(date) {
    return {
        start: getStartOfDay(date),
        end: getEndOfDay(date)
    };
}

/**
 * Get the date range for a month view
 * @param {Date} date - The input date
 * @returns {Object} - Object with start and end dates
 */
export function getMonthRange(date) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

/**
 * Format date for calendar header
 * @param {Date} date - The date to format
 * @param {string} view - Current view ('day', 'week', 'month')
 * @returns {string} - Formatted date string
 */
export function formatCalendarHeader(date, view) {
    switch (view) {
        case 'day':
            return date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
        case 'week':
            const start = getStartOfWeek(date);
            const end = getEndOfWeek(date);
            const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `${startStr} - ${endStr}`;
        case 'month':
            return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        default:
            return date.toLocaleDateString();
    }
}

/**
 * Format date for day header
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string
 */
export function formatDayHeader(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Check if two dates are on the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} - True if same day
 */
export function isSameDay(date1, date2) {
    if (!date1 || !date2) return false;
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

/**
 * Check if a task is scheduled for a specific date
 * @param {Object} task - The task object
 * @param {Date} date - The date to check
 * @returns {boolean} - True if task is scheduled for this date
 */
export function isTaskScheduledForDate(task, date) {
    if (!task || !task.scheduled) return false;
    const scheduledDate = new Date(task.scheduled);
    return isSameDay(scheduledDate, date);
}

/**
 * Check if a task is scheduled for a specific time slot
 * @param {Object} task - The task object
 * @param {Date} start - Time slot start
 * @param {Date} end - Time slot end
 * @returns {boolean} - True if task overlaps with time slot
 */
export function isTaskInTimeSlot(task, start, end) {
    if (!task || !task.scheduled) return false;
    const taskStart = new Date(task.scheduled);
    const taskEnd = new Date(taskStart.getTime() + (task.duration || 60) * MILLISECONDS_IN_MINUTE);
    
    return taskStart < end && taskEnd > start;
}

/**
 * Get time slots for a day
 * @param {Date} date - The date
 * @param {number} slotMinutes - Duration of each slot in minutes
 * @returns {Array} - Array of time slot objects
 */
export function getTimeSlotsForDay(date, slotMinutes = 60) {
    const timeSlots = [];
    const startOfDay = getStartOfDay(date);
    const endOfDay = getEndOfDay(date);
    
    let current = new Date(startOfDay);
    
    while (current < endOfDay) {
        const slotStart = new Date(current);
        const slotEnd = new Date(current.getTime() + slotMinutes * MILLISECONDS_IN_MINUTE);
        
        timeSlots.push({
            start: slotStart,
            end: slotEnd,
            label: slotStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        });
        
        current = slotEnd;
    }
    
    return timeSlots;
}

/**
 * Get work day time slots (8 AM to 6 PM)
 * @param {Date} date - The date
 * @param {number} slotMinutes - Duration of each slot in minutes
 * @returns {Array} - Array of time slot objects
 */
export function getWorkDayTimeSlots(date, slotMinutes = 30) {
    const timeSlots = [];
    const startOfDay = getStartOfDay(date);
    startOfDay.setHours(CALENDAR_CONSTANTS.HOUR_START, 0, 0, 0);
    const endOfDay = getStartOfDay(date);
    endOfDay.setHours(CALENDAR_CONSTANTS.HOUR_END, 0, 0, 0);
    
    let current = new Date(startOfDay);
    
    while (current < endOfDay) {
        const slotStart = new Date(current);
        const slotEnd = new Date(current.getTime() + slotMinutes * MILLISECONDS_IN_MINUTE);
        
        timeSlots.push({
            start: slotStart,
            end: slotEnd,
            label: slotStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        });
        
        current = slotEnd;
    }
    
    return timeSlots;
}

/**
 * Calculate the position and dimensions for a calendar event
 * @param {Object} task - The task
 * @param {Date} date - The date being rendered
 * @param {number} dayWidth - Width of each day column
 * @param {number} slotHeight - Height of each time slot
 * @returns {Object} - Position and dimension data
 */
export function calculateEventPosition(task, date, dayWidth = CALENDAR_CONSTANTS.DAY_WIDTH, slotHeight = CALENDAR_CONSTANTS.TIME_SLOT_HEIGHT) {
    if (!task || !task.scheduled) return null;
    
    const scheduledDate = new Date(task.scheduled);
    const duration = parseFloat(task.duration) || 60; // Default 60 minutes
    
    // Find which day this task belongs to
    const daysInWeek = getDaysInWeek(date);
    let dayIndex = -1;
    
    for (let i = 0; i < daysInWeek.length; i++) {
        if (isSameDay(scheduledDate, daysInWeek[i])) {
            dayIndex = i;
            break;
        }
    }
    
    if (dayIndex === -1) return null;
    
    // Calculate time position within the day
    const hoursFromMidnight = scheduledDate.getHours() + (scheduledDate.getMinutes() / 60);
    const startHour = CALENDAR_CONSTANTS.HOUR_START;
    const timeFromStart = hoursFromMidnight - startHour;
    
    // Calculate dimensions
    const hoursDuration = duration / 60;
    const top = timeFromStart * slotHeight;
    const height = hoursDuration * slotHeight;
    const left = dayIndex * dayWidth;
    const width = dayWidth;
    
    return {
        top,
        left,
        width,
        height,
        dayIndex
    };
}

/**
 * Convert time string (HH:mm) to minutes since midnight
 * @param {string} timeStr - Time string in HH:mm format
 * @returns {number} - Minutes since midnight
 */
export function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * MINUTES_IN_HOUR + (minutes || 0);
}

/**
 * Convert minutes since midnight to time string (HH:mm)
 * @param {number} minutes - Minutes since midnight
 * @returns {string} - Time string in HH:mm format
 */
export function minutesToTimeString(minutes) {
    const hours = Math.floor(minutes / MINUTES_IN_HOUR);
    const mins = minutes % MINUTES_IN_HOUR;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Generate unique ID for calendar events
 * @returns {string} - Unique ID
 */
export function generateEventId() {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if two time ranges overlap
 * @param {Date} start1 - First range start
 * @param {Date} end1 - First range end
 * @param {Date} start2 - Second range start
 * @param {Date} end2 - Second range end
 * @returns {boolean} - True if ranges overlap
 */
export function timeRangesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
}

/**
 * Find conflicts for a task with existing tasks
 * @param {Object} task - The task to check
 * @param {Array} existingTasks - Array of existing tasks
 * @returns {Array} - Array of conflicting tasks
 */
export function findTaskConflicts(task, existingTasks) {
    if (!task || !task.scheduled || !task.duration) return [];
    
    const taskStart = new Date(task.scheduled);
    const taskEnd = new Date(taskStart.getTime() + task.duration * MILLISECONDS_IN_MINUTE);
    
    return existingTasks.filter(existing => {
        if (!existing.scheduled || !existing.duration || existing.uuid === task.uuid) return false;
        
        const existingStart = new Date(existing.scheduled);
        const existingEnd = new Date(existingStart.getTime() + existing.duration * MILLISECONDS_IN_MINUTE);
        
        return timeRangesOverlap(taskStart, taskEnd, existingStart, existingEnd);
    });
}

/**
 * Sort tasks by start time
 * @param {Array} tasks - Array of tasks
 * @returns {Array} - Sorted array of tasks
 */
export function sortTasksByStartTime(tasks) {
    return [...tasks].sort((a, b) => {
        const aTime = a.scheduled ? new Date(a.scheduled).getTime() : Infinity;
        const bTime = b.scheduled ? new Date(b.scheduled).getTime() : Infinity;
        return aTime - bTime;
    });
}

export default {
    getStartOfWeek,
    getEndOfWeek,
    getStartOfDay,
    getEndOfDay,
    getDaysInWeek,
    getWeekRange,
    getDayRange,
    getMonthRange,
    formatCalendarHeader,
    formatDayHeader,
    isSameDay,
    isTaskScheduledForDate,
    isTaskInTimeSlot,
    getTimeSlotsForDay,
    getWorkDayTimeSlots,
    calculateEventPosition,
    timeStringToMinutes,
    minutesToTimeString,
    generateEventId,
    timeRangesOverlap,
    findTaskConflicts,
    sortTasksByStartTime,
    CALENDAR_CONSTANTS
};
