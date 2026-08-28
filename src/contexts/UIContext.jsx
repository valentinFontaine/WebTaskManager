import { createContext, useState, useContext, useCallback } from 'react';

/**
 * UIContext for managing UI state across the application
 */
const UIContext = createContext(null);

/**
 * UIProvider component that wraps the application
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function UIProvider({ children }) {
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationId, setNotificationId] = useState(0);

  /**
   * Show a notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type ('success', 'error', 'info', 'warning')
   * @param {number} duration - Duration in milliseconds (default: 5000)
   */
  const showNotification = useCallback((message, type = 'info', duration = 5000) => {
    const id = notificationId + 1;
    setNotificationId(id);
    
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        dismissNotification(id);
      }, duration);
    }
    
    return id;
  }, [notificationId]);

  /**
   * Dismiss a notification by ID
   * @param {number} id - Notification ID
   */
  const dismissNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  /**
   * Dismiss all notifications
   */
  const dismissAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  /**
   * Set loading state
   * @param {boolean} isLoading - Whether to show loading state
   */
  const setIsLoading = useCallback((isLoading) => {
    setLoading(isLoading);
  }, []);

  /**
   * Show success notification
   * @param {string} message - Success message
   */
  const showSuccess = useCallback((message) => {
    showNotification(message, 'success');
  }, [showNotification]);

  /**
   * Show error notification
   * @param {string} message - Error message
   */
  const showError = useCallback((message) => {
    showNotification(message, 'error', 8000);
  }, [showNotification]);

  /**
   * Show info notification
   * @param {string} message - Info message
   */
  const showInfo = useCallback((message) => {
    showNotification(message, 'info');
  }, [showNotification]);

  /**
   * Show warning notification
   * @param {string} message - Warning message
   */
  const showWarning = useCallback((message) => {
    showNotification(message, 'warning', 6000);
  }, [showNotification]);

  const value = {
    loading,
    setIsLoading,
    notifications,
    showNotification,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    dismissNotification,
    dismissAllNotifications
  };

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

/**
 * Custom hook to consume UIContext
 * @returns {Object} - UI context value
 */
export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

export default UIContext;
