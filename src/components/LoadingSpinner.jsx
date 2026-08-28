/**
 * LoadingSpinner component - Displays a loading spinner
 * @param {Object} props - Component props
 * @param {string} props.size - Size of spinner ('small', 'medium', 'large')
 * @param {string} props.text - Optional text to display next to spinner
 * @returns {JSX.Element}
 */
export default function LoadingSpinner({ size = 'medium', text = '' }) {
  const getSpinnerClass = () => {
    switch (size) {
      case 'small':
        return 'loading-spinner loading-spinner-small';
      case 'large':
        return 'loading-spinner loading-spinner-large';
      default:
        return 'loading-spinner loading-spinner-medium';
    }
  };

  return (
    <div className="loading-container">
      <div className={getSpinnerClass()}>
        <div className="spinner-circle"></div>
      </div>
      {text && <span className="loading-text">{text}</span>}
    </div>
  );
}

/**
 * FullPageLoading component - Displays a full-page loading overlay
 * @returns {JSX.Element}
 */
export function FullPageLoading() {
  return (
    <div className="full-page-loading">
      <LoadingSpinner size="large" text="Loading..." />
    </div>
  );
}
