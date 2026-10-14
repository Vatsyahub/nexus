import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Project identity cell — same pattern as contracts home:
 * project name (primary) + project no. (muted subtitle).
 */
export function ProjectIdentity({
  projectNo,
  projectName,
  href,
  className,
}: {
  projectNo: string;
  projectName: string;
  href?: string;
  className?: string;
}) {
  const name = (
    <span className="break-words font-medium text-[var(--fh-steel)]">
      {projectName}
    </span>
  );
  return (
    <div className={cn("min-w-0 break-words", className)}>
      {href ? (
        <Link href={href} className="hover:underline">
          {name}
        </Link>
      ) : (
        name
      )}
      <p className="break-all text-xs text-[var(--fh-muted)]">{projectNo}</p>
    </div>
  );
}
