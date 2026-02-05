"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "./button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
}: ModalProps) {
  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-5xl",
  };

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className={cn(
          "relative w-full rounded-xl bg-white shadow-2xl flex flex-col",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          "max-h-[90vh]",
          sizes[size]
        )}
      >
        {/* Header - Fixed */}
        <div className="flex items-start justify-between border-b border-slate-200 p-6 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "danger" | "warning" | "default";
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant,
  variant = "default",
  isLoading,
  loading,
}: ConfirmModalProps) {
  const actualVariant = confirmVariant || variant;
  const actualLoading = isLoading || loading;
  const displayMessage = message || description;
  
  const variantStyles = {
    danger: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500",
    warning: "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500",
    default: "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500",
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-600">{displayMessage}</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={actualLoading}>
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          isLoading={actualLoading}
          className={variantStyles[actualVariant]}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
