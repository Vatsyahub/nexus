import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function StubPage({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-8">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-[var(--fh-muted)]">{blurb}</p>
      <p className="text-xs uppercase tracking-wide text-[var(--fh-accent)]">
        Coming in a later slice
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to home
      </Link>
    </div>
  );
}
