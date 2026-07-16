import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'white' | 'dark';
}

export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="mt-g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="mt-g2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#6D28D9" />
        </linearGradient>
        <linearGradient id="mt-g3" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#DDD6FE" />
        </linearGradient>
      </defs>
      <g strokeLinejoin="round">
        <path d="M60 8 L72 15 L72 29 L60 36 L48 29 L48 15 Z" fill="url(#mt-g1)" stroke="url(#mt-g1)" strokeWidth="1" />
        <path d="M30 38 L42 31 L54 38 L54 52 L42 59 L30 52 Z" fill="url(#mt-g2)" stroke="url(#mt-g2)" strokeWidth="1" />
        <path d="M66 38 L78 31 L90 38 L90 52 L78 59 L66 52 Z" fill="url(#mt-g2)" stroke="url(#mt-g2)" strokeWidth="1" />
        <path d="M48 55 L60 48 L72 55 L72 69 L60 76 L48 69 Z" fill="url(#mt-g1)" stroke="url(#mt-g1)" strokeWidth="1" />
        <path d="M30 68 L42 61 L54 68 L54 82 L42 89 L30 82 Z" fill="url(#mt-g3)" stroke="url(#mt-g3)" strokeWidth="1" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 36, className = '', showText = false, variant = 'default' }: LogoProps) {
  const textColor = variant === 'white' ? 'text-white' : variant === 'dark' ? 'text-purple-900' : 'text-purple-900 dark:text-purple-100';

  if (!showText) {
    return <LogoMark size={size} className={className} />;
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <div className="flex flex-col leading-none">
        <span className={`text-sm font-bold tracking-tight ${textColor}`}>
          Microtechnique
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-widest ${variant === 'white' ? 'text-purple-200' : 'text-purple-500 dark:text-purple-400'}`}>
          ERP
        </span>
      </div>
    </div>
  );
}
