import { useEffect } from 'react';
import { useUI } from '../contexts/UIContext';

/**
 * Notification component - Displays a single notification message
 * @param {Object} props - Component props
 * @param {Object} props.notification - Notification object with id, message, type
 * @returns {JSX.Element}
 */
export default function Notification({ notification }) {
  const { dismissNotification } = useUI();

  useEffect(() => {
    // Auto-dismiss after a delay if not already dismissed
    // The UIContext already handles auto-dismiss, but we can add cleanup
    return () => {
      // Cleanup if needed
    };
  }, [notification, dismissNotification]);

  if (!notification) return null;

  const { message, type } = notification;

  const getNotificationClass = () => {
    switch (type) {
      case 'success':
        return 'notification notification-success';
      case 'error':
        return 'notification notification-error';
      case 'warning':
        return 'notification notification-warning';
      default:
        return 'notification notification-info';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  return (
    <div className={getNotificationClass()}>
      <span className="notification-icon">{getIcon()}</span>
      <span className="notification-message">{message}</span>
      <button 
        className="notification-dismiss"
        onClick={() => dismissNotification(notification.id)}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/**
 * NotificationContainer component - Displays all active notifications
 * @returns {JSX.Element}
 */
export function NotificationContainer() {
  const { notifications } = useUI();

  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <Notification 
          key={notification.id} 
          notification={notification} 
        />
      ))}
    </div>
  );
}
