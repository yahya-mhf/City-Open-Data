"use client";

import clsx from "clsx";
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
}

interface BadgeProps {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "amber";
  className?: string;
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

interface TabsProps {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}

interface ModalProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

interface DrawerProps {
  open: boolean;
  children: React.ReactNode;
  onClose: () => void;
  side?: "left" | "right" | "bottom";
}

interface TooltipProps {
  label: string;
  children: React.ReactNode;
}

interface SkeletonProps {
  className?: string;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex min-h-9 items-center justify-center rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2 text-sm",
        size === "icon" && "h-9 w-9 p-0 text-sm",
        variant === "primary" && "bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600",
        variant === "secondary" && "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-night-border dark:bg-night-secondary dark:text-gray-200 dark:hover:bg-night-border",
        variant === "ghost" && "text-gray-600 hover:bg-gray-100 hover:text-primary-700 dark:text-gray-300 dark:hover:bg-night-border dark:hover:text-gray-100",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({ children, tone = "default", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "default" && "bg-gray-100 text-gray-700 dark:bg-night-border dark:text-gray-300",
        tone === "success" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        tone === "warning" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        tone === "amber" && "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
        tone === "danger" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        tone === "info" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ padded = true, className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-gray-200 bg-white shadow-sm dark:border-night-border dark:bg-night-secondary",
        padded && "p-6",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ invalid, className, ...props }: FieldProps) {
  return (
    <input
      className={clsx(
        "w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 dark:bg-night-primary dark:text-gray-100",
        invalid ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30" : "border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-night-border dark:focus:ring-primary-900/30",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ invalid, className, ...props }: SelectProps) {
  return (
    <select
      className={clsx(
        "w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 outline-none transition dark:bg-night-primary dark:text-gray-100",
        invalid ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30" : "border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-night-border dark:focus:ring-primary-900/30",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ invalid, className, ...props }: TextareaProps) {
  return (
    <textarea
      className={clsx(
        "w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 dark:bg-night-primary dark:text-gray-100",
        invalid ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30" : "border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-night-border dark:focus:ring-primary-900/30",
        className,
      )}
      {...props}
    />
  );
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-gray-200 dark:border-night-border" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          role="tab"
          aria-selected={active === tab.id}
          className={clsx(
            "px-4 py-2 text-sm font-medium transition",
            active === tab.id
              ? "border-b-2 border-primary-600 text-primary-600 dark:text-primary-400"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, children, onClose }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/40" aria-label="Close modal" onClick={onClose} />
      <Card className="relative z-[3001] mx-4 w-full max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        {children}
      </Card>
    </div>
  );
}

export function Drawer({ open, children, onClose, side = "right" }: DrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/30" aria-label="Close drawer" onClick={onClose} />
      <div
        className={clsx(
          "absolute bg-white shadow-2xl dark:bg-night-secondary",
          side === "right" && "right-0 top-0 h-full w-full max-w-xl",
          side === "left" && "left-0 top-0 h-full w-full max-w-xl",
          side === "bottom" && "bottom-0 left-0 max-h-[75vh] w-full rounded-t-xl",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow group-hover:block">
        {label}
      </span>
    </span>
  );
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={clsx("animate-pulse rounded-lg bg-gray-200 dark:bg-night-border", className)} />;
}
