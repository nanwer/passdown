import { ApplicationError, acceptInvitationSchema } from '@guide/contracts';
import { getApplication, enforceRateLimit, currentSession } from '../../../../lib/application';
import { apiResponse, assertOrigin, parseInput, readJSON } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ token: string }> };

/**
 * What an invitation link leads to, for somebody who has no account yet.
 *
 * Unauthenticated by necessity — the whole point is that the holder is not a
 * member of anything. The token is the only credential, so this is rate
 * limited by address: without that, a public endpoint that answers yes or no
 * about a secret is a guessing machine.
 *
 * Expired, already used, and never existed all return the same nothing.
 */
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { token } = await context.params;
    await enforceRateLimit('invitation:lookup', 120);
    const invitation = await getApplication().store.describeInvitation(token);
    if (!invitation)
      throw new ApplicationError('NOT_FOUND', 'This invitation is no longer valid.', 404);
    return Response.json({
      workspaceName: invitation.workspaceName,
      email: invitation.email,
      role: invitation.role,
      // So the page can ask for a password or ask them to sign in, rather than
      // offering a sign-up form that cannot succeed.
      hasAccount: (await getApplication().store.findAccount(invitation.email)) !== null,
    });
  });
}

/**
 * Accept it: join the workspace, creating an account first if there is none.
 *
 * Two ways in. Somebody with no account chooses a password here, so nothing is
 * generated and nothing has to be changed afterwards. Somebody who already has
 * an account signs in as it and accepts — which is the only way to join the two
 * up without the holder of a link being able to claim an existing address.
 *
 * Either way the address comes from the invitation rather than the request.
 *
 * This used to assume signing up would throw for an address that already had an
 * account. It does not: it returns a user whose id does not exist, so the
 * membership insert failed on its foreign key and the caller was told the
 * service was unavailable.
 */
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const app = getApplication();
    assertOrigin(request, app.origin);
    const { token } = await context.params;
    await enforceRateLimit('invitation:accept', 60);
    const input = parseInput(acceptInvitationSchema, {
      ...((await readJSON(request)) as object),
      token,
    });
    const invitation = await app.store.describeInvitation(token);
    if (!invitation)
      throw new ApplicationError('NOT_FOUND', 'This invitation is no longer valid.', 404);

    const existing = await app.store.findAccount(invitation.email);
    let userId: string;
    let createdAccount = false;
    if (existing) {
      // Proof that the person holding the link is the person who owns the
      // address: they are signed in as it. A link alone must never be enough to
      // act as an existing account.
      const session = await currentSession(request.headers);
      const signedInAs = session?.user.email?.trim().toLowerCase();
      if (signedInAs !== invitation.email.trim().toLowerCase())
        throw new ApplicationError(
          'VALIDATION_ERROR',
          `An account already exists for ${invitation.email}. Sign in as it, then open this link again.`,
          422,
        );
      userId = existing.id;
    } else {
      if (!input.name || !input.password)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'Choose a name and a password to create your account.',
          422,
        );
      try {
        const created = await app.invitedSignUp.api.signUpEmail({
          body: { email: invitation.email, password: input.password, name: input.name },
        });
        userId = created.user.id;
        createdAccount = true;
      } catch (error) {
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'That account could not be created. Ask for the invitation again.',
          422,
          undefined,
        );
      }
    }

    const workspace = await app.store.acceptInvitation(token, userId);
    if (!workspace)
      // Someone used the link between the check above and here.
      throw new ApplicationError('CONFLICT', 'This invitation has just been used.', 409);

    // Verified because the invitation is the proof: a manager of the workspace
    // named this address, and there is no mail server to confirm it with.
    if (createdAccount) await app.store.markEmailVerified(userId);
    // Somebody already signed in stays signed in; there is no new password to
    // exchange for a session.
    if (!createdAccount) return Response.json({ workspace }, { status: 201 });

    // And signed in, which does not happen by itself. This installation
    // requires a verified address before a session is issued, so signing up
    // returns no session at all — without this the person would be sent
    // straight from accepting an invitation to a sign-in form, holding a
    // password they chose ten seconds ago.
    //
    // Verification has to come first, which is why this is here and not beside
    // the sign-up above.
    const signedIn = await app.identity.api.signInEmail({
      body: { email: invitation.email, password: input.password! },
      asResponse: true,
    });
    const response = Response.json({ workspace }, { status: 201 });
    for (const cookie of signedIn.headers.getSetCookie())
      response.headers.append('set-cookie', cookie);
    return response;
  });
}
