function Button({ children, className = "", variant = "default", ...rest }) {
  let base =
    "py-2 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ";
  let color = "";
  if (variant === "default")
    color = "bg-neutral-800 text-white hover:bg-neutral-700";
  else if (variant === "outline")
    color =
      "bg-transparent text-neutral-200 border border-neutral-600 hover:bg-neutral-900";
  else if (variant === "destructive")
    color = "bg-red-600 text-white hover:bg-red-700";
  return (
    <button className={base + color + " " + className} {...rest}>
      {children}
    </button>
  );
}

export default Button;
