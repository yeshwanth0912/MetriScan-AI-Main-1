export function ShinyButton({
  children,
  onClick,
  className = "",
  type = "button",
  disabled = false,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`shiny-cta ${className} ${disabled ? "!opacity-50 !cursor-not-allowed !pointer-events-none" : ""}`}
      onClick={onClick}
      {...props}
    >
      <span>{children}</span>
    </button>
  );
}

export default ShinyButton;
