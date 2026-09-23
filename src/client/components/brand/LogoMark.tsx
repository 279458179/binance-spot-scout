import type { ReactNode } from "react";

export function LogoMark({ className = "size-6" }: { className?: string }): ReactNode {
  return (
    <svg aria-hidden viewBox="0 0 28 28" className={className} fill="none">
      <path d="M5.5 22.5C5.5 13.4 9.9 8.2 14 8.2s8.5 5.2 8.5 14.3" stroke="#1d1d1f" strokeLinecap="round" strokeWidth="2" />
      <path d="M8.8 7.9 11 4.8M19.2 7.9 17 4.8" stroke="#1d1d1f" strokeLinecap="round" strokeWidth="2" />
      <path d="M14 8.2v7.3" stroke="rgba(0,113,227,.36)" strokeLinecap="round" strokeWidth="2" />
      <circle cx="14" cy="18.8" r="3.25" fill="#0071e3" />
    </svg>
  );
}
