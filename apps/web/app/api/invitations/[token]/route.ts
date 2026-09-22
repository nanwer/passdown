import { ApplicationError, acceptInvitationSchema } from '@guide/contracts';
import { getApplication, enforceRateLimit } from '../../../../lib/application';
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
    });
  });
}

/**
 * Accept it: create the account, then join the workspace.
 *
 * The person chooses their own password here, so nothing is generated and
 * nothing has to be changed afterwards. The address is taken from the
 * invitation rather than from the request — otherwise the holder of a link
 * could sign up as anyone.
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

    let userId: string;
    try {
      const created = await app.invitedSignUp.api.signUpEmail({
        body: { email: invitation.email, password: input.password, name: input.name },
      });
      userId = created.user.id;
    } catch {
      // The commonest cause is an address that already has an account, which
      // this flow cannot join up safely without proving the two are the same
      // person — so it says what to do rather than what went wrong internally.
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'An account already exists for this address. Sign in, and ask for the invitation again.',
        422,
      );
    }

    const workspace = await app.store.acceptInvitation(token, userId);
    if (!workspace)
      // Someone used the link between the check above and here.
      throw new ApplicationError('CONFLICT', 'This invitation has just been used.', 409);

    // Verified because the invitation is the proof: a manager of the workspace
    // named this address, and there is no mail server to confirm it with.
    await app.store.markEmailVerified(userId);

    // And signed in, which does not happen by itself. This installation
    // requires a verified address before a session is issued, so signing up
    // returns no session at all — without this the person would be sent
    // straight from accepting an invitation to a sign-in form, holding a
    // password they chose ten seconds ago.
    //
    // Verification has to come first, which is why this is here and not beside
    // the sign-up above.
    const signedIn = await app.identity.api.signInEmail({
      body: { email: invitation.email, password: input.password },
      asResponse: true,
    });
    const response = Response.json({ workspace }, { status: 201 });
    for (const cookie of signedIn.headers.getSetCookie())
      response.headers.append('set-cookie', cookie);
    return response;
  });
}
