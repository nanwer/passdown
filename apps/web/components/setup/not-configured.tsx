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
/**
 * A database nobody can sign in to: migrations have not run, or it holds a
 * workspace but no accounts (an incomplete restore). The default login is only
 * ever created in an empty database, so there is nothing to offer here.
 */
export function NoAccount() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Passdown has no account yet</h1>
      <p className="mt-4 text-muted-foreground">
        Ask the operator to run the migrations, which create the first login in an empty
        installation, or to restore a complete backup. Then reload this page.
      </p>
    </main>
  );
}
