/**
 * Websocket server for `amp-script` chat demo app.
 * Includes basic expirable session bookkeeping.
 * (Demo quality, don't use this in production. ❤️)
 */
import crypto from 'crypto';
import ws from 'ws';
import SECRET from './secret';

/** Revoke username when session hasn't pinged in N seconds. */
const SESSION_EXPIRATION = 5 * 60;

/** Check session ping every N seconds. */
const SESSION_EXPIRATION_CHECK_FREQ = 60;

/**
 * Separator character for pre-hash token parts.
 * This character should NOT be allowed in parts themselves.
 */
const TOKEN_PART_SEP = '^';

/**
 * Maps username to session.
 * Session shaped:
 *   {{
 *     token: string,
 *     ping: number|undefined,
 *     timeout: number|undefined,
 *   }}
 * - token: Authenticates incoming messages from `username`.
 * - ping: Unix timestamp of last user ping.
 * - timeout: Timeout ID after last ping.
 */
const sessions = {};

/** Returns current time as UNIX timestamp. */
const unixTime = () => Math.floor(new Date().getTime() / 1000);

/** Sequences next token. Initial is startup timestamp for impredactibility. */
let tokenIndex = unixTime();

// Initialize and handle connections.
const wsServer = new ws.Server({port: 8080});
wsServer.on('connection', ws => {
  ws.on('message', serializedMessage => handleIncoming(ws, serializedMessage));
});

/**
 * Handles an incoming message with different intents for which the server may
 * respond individually or broadcast to the room.
 * 
 * Incoming messages are shaped:
 * 
 *  {{
 *    username: string,
 *    token: string|undefined,
 *    join: boolean|undefined,
 *    content: string|undefined,
 *  }}
 * 
 * - `username` is required always.
 * - `token` is required for intents that require authentication (set by server
 *   and parroted by client.)
 * - `join`, `content` and `ping` are mutually exclusive (oneof) and indicate
 *   different intents:
 *   - `join` indicates a request to join the chatroom. `token` not required.
 *   - `ping` keeps a session alive. `token` required.
 *   - `content` includes a text message from a user who's joined. `token`
 *     required.
 * 
 * Outbound messages are shaped:
 * 
 *   {{
 *     username: string,
 *     join: boolean|undefined,
 *     leave: boolean|undefined,
 *     content: string|undefined,
 *     error: string|undefined,
 *     token: string|undefined,
 *   }}
 * 
 * - `username` is always included, indicating the originator of the message,
 *   except on `error`.
 * - all other fields are mutually exclusive (oneof) and indicate different
 *   intents:
 * 
 *   - `join` (broadcast) indicates that a new user has joined the room.
 *   - `leave` (broadcast) indicates that a user has left the room.
 *   - `content` (broadcast) indicates a text message.
 *   - `token` (1:1) is included in a one-time message as response to a user
 *     successfully starting a session.
 *   - `error` (1:1) defines an exception message.
 * 
 * All responses and broadcasts are immediate except for those including
 * `leave`, which are sent asynchronously after 
 */
function handleIncoming(ws, serializedMessage) {
  const message = JSON.parse(serializedMessage);
  const {username} = message;

  if (message.join) {
    // Start session joining as `username`.
    if (!tryJoining(ws, username)) {
      // Don't broadcast joining message if unable.
      return;
    }
  } else if (!hasValidToken(message)) {
    // Don't broadcast non-join messages if token is not supplied or invalid.
    return;
  }

  // Keeps connection alive.
  if (message.ping) {
    ping(username);
    return; // Pings shouldn't be broadcast.
  }

  // Remove token from broadcast.
  const {token: unusedTokenDontLeak, ...broadcast} = message;
  broadcastJson(broadcast);
}

/**
 * Replies to `ws` client when able to join as `username`. Otherwise replies
 * with an error message.
 * Returns boolean indicating if successfully joined.
 */
function tryJoining(ws, username) {
  if (!isValidUsername(username)) {
    sendJson(ws, {
      error:
        'Invalid username! ' +
        'Use only alphanumeric characters, dashes, underscores or periods.'
    });
    return false;
  }
  const token = maybeJoinAs(username);
  if (!token) {
    sendJson(ws, {error: 'Username taken!'});
    return false;
  }
  sendJson(ws, {token, username});
  return true;
}

/** Validates `token` against `username` in `message` for bookkept sessions. */
const hasValidToken = ({username, token}) =>
  token &&
  username in sessions &&
  sessions[username].token == token

/**
 * Joins as `username` if handle is not taken.
 * Returns session token when successful, `false` otherwise.
 */
function maybeJoinAs(username) {
  if (username in sessions) {
    return false;
  }
  const token = createToken(username);
  sessions[username] = {token};
  ping(username);
  return token;
}

/**
 * Allows 3 or more [0-9a-Z._-] characters.
 * Any character could potentially be allowed safely except `TOKEN_PART_SEP`.
 */
const isValidUsername = username => /^[0-9a-zA-Z._-]{3,}$/.test(username);

/**
 * Creates a session token for a username.
 * Hashed value is global-sequential, username-exclusive and salted with
 * `SECRET` to guarantee uniqueness and opacity.
 */
const createToken = username =>
  crypto
    .createHash('sha512')
    .update([SECRET, username, tokenIndex++].join(TOKEN_PART_SEP))
    .digest('hex');

/** Keeps session alive and schedules the next SESSION_EXPIRATION check. */
function ping(username) {
  const session = sessions[username];
  if (!session) {
    return;
  }
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }
  session.ping = unixTime();
  session.timeout = setExpirationTimeout(username);
}

/**
 * Schedules a SESSION_EXPIRATION check for a session.
 * Clears session when no longer alive.
 */
function setExpirationTimeout(username) {
  const {key} = sessions[username];
  return setTimeout(() => {
    const session = sessions[username];
    if (!session) {
      return; // expired previously
    }
    if (key != session.key) {
      return; // stale timeout
    }
    if (unixTime() - session.ping <= SESSION_EXPIRATION) {
      session.timeout = setExpirationTimeout(username);
      return;
    }
    delete sessions[username];
    broadcastJson({leave: true, username});
  }, SESSION_EXPIRATION_CHECK_FREQ * 1000);
}

/** Broadcasts `data` as serialized JSON to all open clients. */
function broadcastJson(data) {
  const serialized = JSON.stringify({timestamp: unixTime(), ...data});
  for (const client of wsServer.clients) {
    sendIfOpen(client, serialized);
  }
}

/** Sends `data` as serialized JSON to an open client. */
function sendJson(client, data) {
  sendIfOpen(client, JSON.stringify(data));
}

/** Sends string `data` to an open client. */
function sendIfOpen(client, serialized) {
  if (client.readyState === ws.OPEN) {
    client.send(serialized);
  }
}
