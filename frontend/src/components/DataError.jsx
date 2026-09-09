export default function DataError({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="data-error">
      <div className="de-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
        </svg>
        Could not load data
      </div>
      <div className="de-msg">{error}</div>
      {onRetry && (
        <button className="de-retry" onClick={onRetry}>Retry</button>
      )}
    </div>
  )
}
