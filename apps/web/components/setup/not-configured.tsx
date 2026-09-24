export function NotConfigured() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">This installation is not configured yet</h1>
      <p className="mt-4 text-muted-foreground">
        Ask the operator to check the database and sign-in settings, then restart Passdown.
      </p>
    </main>
  );
}
