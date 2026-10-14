import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UserForm } from "@/components/user-form";

export default async function NewUserPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.access?.users !== "edit") redirect("/");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Create user
        </h1>
      </div>
      <UserForm />
    </div>
  );
}
