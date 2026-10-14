import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { HUB_NAME, HUB_TAGLINE } from "@/lib/types";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; passwordChanged?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const error =
    params.error === "CredentialsSignin"
      ? "Email or password does not match. Try again."
      : params.error
        ? "Could not sign in. Try again."
        : null;
  const success =
    params.passwordChanged === "1"
      ? "Password updated. Sign in with your new password."
      : null;

  return (
    <div className="h-dvh overflow-y-auto bg-[var(--fh-steel)] px-5 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="mb-[22px] flex flex-col items-center">
          <div className="flex h-[212px] w-[196px] items-center justify-center overflow-hidden">
            <img
              src="/cradle-mark.png"
              alt=""
              className="h-[204px] w-auto max-w-none"
            />
          </div>
          <p className="mt-2 w-full text-center font-[family-name:var(--font-brand)] text-2xl font-bold leading-[1.15] text-black">
            Cradle Runways India Pvt.Ltd.
          </p>
        </div>
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-[22px] text-center">
            <h1 className="font-[family-name:var(--font-brand)] text-[52px] font-semibold leading-[0.95] tracking-[-0.02em] text-[var(--fh-brand)]">
              {HUB_NAME}
            </h1>
            <p className="mt-3 text-[15px] text-white/85">{HUB_TAGLINE}</p>
          </div>
          <LoginForm error={error} success={success} />
        </div>
      </div>
    </div>
  );
}
