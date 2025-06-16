export const FormInput = ({ label, name, type = 'text', required = false, ...props }) => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-sna-dark mb-1">
      {label} {required && <span className="text-sna-error">*</span>}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      className="w-full rounded-sna border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary/20 transition-colors duration-200"
      required={required}
      {...props}
    />
  </div>
);

export const FormTextarea = ({ label, name, required = false, ...props }) => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-sna-dark mb-1">
      {label} {required && <span className="text-sna-error">*</span>}
    </label>
    <textarea
      id={name}
      name={name}
      rows="4"
      className="w-full rounded-sna border-gray-300 shadow-sm focus:border-sna-primary focus:ring-sna-primary/20 transition-colors duration-200"
      required={required}
      {...props}
    />
  </div>
);

export const FormCheckbox = ({ label, name, ...props }) => (
  <div className="mb-4 flex items-center">
    <input
      type="checkbox"
      id={name}
      name={name}
      className="h-4 w-4 rounded border-gray-300 text-sna-primary focus:ring-sna-primary/20 transition-colors duration-200"
      {...props}
    />
    <label htmlFor={name} className="ml-2 block text-sm text-sna-dark">
      {label}
    </label>
  </div>
);

export const FormFileInput = ({ label, name, accept, required = false, ...props }) => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-sna-dark mb-1">
      {label} {required && <span className="text-sna-error">*</span>}
    </label>
    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-sna hover:border-sna-primary/50 transition-colors duration-200">
      <div className="space-y-1 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex text-sm text-gray-600">
          <label
            htmlFor={name}
            className="relative cursor-pointer rounded-md font-medium text-sna-primary hover:text-sna-primary/80"
          >
            <span>Télécharger un fichier</span>
            <input
              id={name}
              name={name}
              type="file"
              accept={accept}
              className="sr-only"
              required={required}
              {...props}
            />
          </label>
          <p className="pl-1">ou glisser-déposer</p>
        </div>
        <p className="text-xs text-gray-500">PNG, JPG, GIF jusqu'à 10MB</p>
      </div>
    </div>
  </div>
);

export const Button = ({ children, variant = 'primary', type = 'button', ...props }) => {
  const baseClasses = "px-4 py-2 rounded-sna font-medium transition-all duration-200 disabled:opacity-50 transform hover:scale-[1.02] active:scale-[0.98]";
  const variants = {
    primary: "bg-sna-primary text-white hover:bg-sna-primary/90 shadow-sm hover:shadow",
    secondary: "bg-sna-secondary text-sna-dark hover:bg-sna-secondary/90 shadow-sm hover:shadow",
    outline: "border-2 border-sna-primary text-sna-primary hover:bg-sna-primary/10"
  };

  return (
    <button
      type={type}
      className={`${baseClasses} ${variants[variant]}`}
      {...props}
    >
      {children}
    </button>
  );
}; 