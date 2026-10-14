"use client";

import Link from "next/link";
import { History, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type IconBtnProps = {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function EditIconButton({
  label = "Edit",
  onClick,
  disabled,
  className,
}: IconBtnProps) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(className)}
    >
      <Pencil className="size-3.5" aria-hidden />
    </Button>
  );
}

export function EditIconLink({
  href,
  label = "Edit",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        buttonVariants({ size: "icon-sm", variant: "outline" }),
        className
      )}
    >
      <Pencil className="size-3.5" aria-hidden />
    </Link>
  );
}

export function DeleteIconButton({
  label = "Delete",
  onClick,
  disabled,
  className,
}: IconBtnProps) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="destructive"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(className)}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </Button>
  );
}

export function HistoryIconButton({
  label = "History",
  onClick,
  disabled,
  className,
}: IconBtnProps) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(className)}
    >
      <History className="size-3.5" aria-hidden />
    </Button>
  );
}
