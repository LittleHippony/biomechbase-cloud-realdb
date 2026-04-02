import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  icon,
  className = '',
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "border-transparent text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500",
    secondary: "border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-indigo-500",
    danger: "border-transparent text-white bg-red-600 hover:bg-red-700 focus:ring-red-500",
    ghost: "border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-500 shadow-none"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="mr-2 -ml-1 h-5 w-5">{icon}</span>}
      {children}
    </button>
  );
};
