"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  mode: AuthMode;
};

const serviceTypes = [
  "Forestry Mulching",
  "Land Clearing",
  "Dirt Work / Excavation",
  "Fencing",
  "Drainage",
  "Landscaping",
  "Irrigation"
];

function getCleanAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }

  if (normalized.includes("email rate limit")) {
    return "Too many signup attempts. Wait a few minutes, then try again.";
  }

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "An account already exists for this email. Log in instead.";
  }

  if (normalized.includes("password")) {
    return "Use a stronger password with at least 6 characters.";
  }

  return message || "Something went wrong. Try again.";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [mainServiceType, setMainServiceType] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const supabaseMissing = !hasSupabaseConfig || searchParams.get("setup") === "supabase";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase is not configured yet. Add the public Supabase URL and anon key to your environment.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = isSignup
        ? await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                full_name: fullName.trim(),
                company_name: companyName.trim(),
                main_service_type: mainServiceType
              }
            }
          })
        : await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
          });

      if (result.error) {
        setMessage(getCleanAuthError(result.error.message));
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setMessage("Unable to reach authentication right now. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={isSignup ? "auth-page signup-auth-page" : "auth-page login-auth-page"}>
      {isSignup ? (
        <aside className="auth-brand-panel">
          <Link className="auth-logo dark-logo" href="/" aria-label="Acrex home">
            <Image src="/assets/acrex-logo.png" alt="Acrex" width={178} height={54} priority />
          </Link>
          <div>
            <p className="section-kicker">Acrex Early Access</p>
            <h1>Build quotes from the property, not from guesswork.</h1>
            <p>Set up your contractor workspace for measuring acreage, marking work zones, and quoting jobs faster.</p>
          </div>
          <ul className="auth-benefit-list">
            <li>Measure acreage from a map workspace</li>
            <li>Mark clearing, mulching, drainage, and fence work</li>
            <li>Move from takeoff to quote without switching tools</li>
          </ul>
        </aside>
      ) : null}

      <section className="auth-card">
        <Link className="auth-logo" href="/" aria-label="Acrex home">
          <Image src="/assets/acrex-logo.png" alt="Acrex" width={150} height={45} priority />
        </Link>
        <p className="section-kicker">{isSignup ? "Create workspace" : "Acrex account"}</p>
        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-copy">
          {isSignup
            ? "Tell us what kind of work you quote so Acrex can shape the workspace around your jobs."
            : "Log in to continue measuring properties and building quotes."}
        </p>

        {supabaseMissing ? (
          <div className="auth-warning">
            Supabase environment variables are missing. Add `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` before using real accounts.
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup ? (
            <>
              <label>
                Full Name
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  placeholder="Your full name"
                  required
                />
              </label>
              <label>
                Company Name
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  autoComplete="organization"
                  placeholder="Company or crew name"
                  required
                />
              </label>
              <label>
                Main Service Type
                <select
                  value={mainServiceType}
                  onChange={(event) => setMainServiceType(event.target.value)}
                  required
                >
                  <option value="" disabled>Select your main service</option>
                  {serviceTypes.map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={6}
              placeholder={isSignup ? "Create a password" : "Enter your password"}
              required
            />
          </label>
          <button className={isSubmitting ? "is-processing" : ""} type="submit" disabled={isSubmitting || supabaseMissing}>
            {isSubmitting ? (isSignup ? "Creating Account..." : "Logging In...") : isSignup ? "Create Account" : "Log In"}
          </button>
        </form>

        {message ? <p className="auth-message">{message}</p> : null}

        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "Need an account?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Log in" : "Sign up"}</Link>
        </p>
      </section>
    </main>
  );
}
