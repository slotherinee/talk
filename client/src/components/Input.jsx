function Input(props) {
  return (
    <input
      {...props}
      className={
        `w-full mb-4 text-white bg-transparent border border-neutral-800 placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-600 rounded-lg px-4 py-2 ` +
        (props.className || "")
      }
    />
  );
}

export default Input;