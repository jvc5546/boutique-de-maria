// Cognito trigger: the invite list.
//
// Cognito calls this function at two moments:
//   1. PreSignUp_ExternalProvider: the first time a Google account signs in.
//      If the email isn't an active user in the table, Cognito never creates
//      the user.
//   2. TokenGeneration_*: every sign-in and every token refresh (about once an
//      hour). Removed users lose access at their next refresh, and the ID token
//      carries their role and tier for the site to read.
//
// Any other way of creating a user (the SignUp API, AdminCreateUser) is
// refused: this site only signs people in with Google.
//
// Throwing an error makes Cognito refuse. The message reaches the browser as
// "PreSignUp failed with error NO_INVITADO." and the site shows a friendly note.

export const NOT_INVITED = 'NO_INVITADO';

export function makeHandler(findUser) {
  return async function handler(event) {
    const source = event.triggerSource ?? '';

    if (source.startsWith('PreSignUp_')) {
      if (source !== 'PreSignUp_ExternalProvider') throw new Error(NOT_INVITED);
      await requireActiveUser(event, findUser);
      return event;
    }

    if (source.startsWith('TokenGeneration_')) {
      const user = await requireActiveUser(event, findUser);
      event.response = event.response ?? {};
      event.response.claimsOverrideDetails = {
        claimsToAddOrOverride: {
          bdm_role: user.role,
          bdm_tier: user.tier ?? '',
          bdm_name: user.name ?? '',
        },
      };
      return event;
    }

    return event;
  };
}

async function requireActiveUser(event, findUser) {
  const attrs = event.request?.userAttributes ?? {};
  const email = String(attrs.email ?? '').trim().toLowerCase();
  if (!email) throw new Error(NOT_INVITED);
  // Google always verifies Gmail addresses; refuse anything it says isn't verified.
  if (attrs.email_verified !== undefined && String(attrs.email_verified) !== 'true') {
    throw new Error(NOT_INVITED);
  }
  const user = await findUser(email);
  if (!user || user.status !== 'active') {
    console.log(JSON.stringify({ msg: 'refused', trigger: event.triggerSource }));
    throw new Error(NOT_INVITED);
  }
  return user;
}

// DynamoDB lookup. The SDK ships with the Lambda Node.js runtime, so nothing is
// bundled; it's imported lazily so the tests can run without it.
let client;
async function findUserInTable(email) {
  const { DynamoDBClient, GetItemCommand } = await import('@aws-sdk/client-dynamodb');
  client ??= new DynamoDBClient({});
  const out = await client.send(
    new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: { S: `USER#${email}` }, sk: { S: 'PROFILE' } },
      ConsistentRead: true,
    }),
  );
  if (!out.Item) return null;
  const s = (k) => out.Item[k]?.S;
  return { email, name: s('name'), role: s('role'), tier: s('tier'), status: s('status') };
}

export const handler = makeHandler(findUserInTable);
