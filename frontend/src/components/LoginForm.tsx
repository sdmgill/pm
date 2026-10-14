import { FormEvent, useState } from "react";

type LoginFormProps = {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  error: string | null;
};

export const LoginForm = ({ onLogin, onRegister, error }: LoginFormProps) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("user");
  const [password, setPassword] = useState("password");

  const switchMode = () => {
    const next = !isRegistering;
    setIsRegistering(next);
    setUsername(next ? "" : "user");
    setPassword(next ? "" : "password");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await (isRegistering ? onRegister(username, password) : onLogin(username, password));
  };

  const submitLabel = isRegistering ? "Create account" : "Sign in";

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] items-center justify-center px-6">
      <section className="w-full rounded-[28px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          PM MVP
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          {submitLabel}
        </h1>
        <p className="mt-3 text-sm text-[var(--gray-text)]">
          {isRegistering
            ? "Pick a username and password to get your own boards."
            : "Use the demo credentials or your own account."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-[var(--navy-dark)]" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="w-full rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />

          <label className="block text-sm font-medium text-[var(--navy-dark)]" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="w-full rounded-xl border border-[var(--stroke)] px-4 py-3 text-sm"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegistering ? "new-password" : "current-password"}
          />

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            className="w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white"
            type="submit"
          >
            {submitLabel}
          </button>
        </form>

        <button
          className="mt-4 text-sm font-medium text-[var(--primary-blue)]"
          type="button"
          onClick={switchMode}
        >
          {isRegistering ? "Have an account? Sign in" : "Need an account? Create one"}
        </button>
      </section>
    </main>
  );
};
