/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 /**
 * `amp-script` client for Websocket chat server through `ws.js`.
 * (Demo quality, don't use this in production. ❤️)
 * 
 * Written in vanilla ES5 for convenience with zero dependencies and no build
 * process for drop-in browser compatibility.
 * 
 * Production-quality code would be written in modern Javascript transpiled
 * through Babel (https://babeljs.io).
 * 
 * For possible bundlers that aid with the build process, see:
 * 
 * - rollup (https://rollupjs.org/),
 * - webpack (https://webpack.js.org),
 * - or parcel (https://parceljs.org).
 * 
 * DOM APIs are employed directly for rendering, which can be awkward.
 * Rendering frameworks can help define more expressive dynamic trees:
 * 
 * - React (https://reactjs.org) / Preact (https://preactjs.com)
 * - Vue (https://vuejs.org)
 */

/** Display a timestamp header after N seconds between messages. */
var MIN_TIMESTAMP_HEADER_DELTA = 15 * 60;

/** Ping every N seconds. */
var PING_FREQ = 30;

var connection;

var session = {
  username: null,
  token: null, // authenticates username
  lastMessageTimestamp: 0, // last received timestamp for header display deltas
};

/** Re-usable, only for serializing/formatting. */
var serializableDate = new Date();

/** Sends `message` as serialized JSON to WS host, including auth fields. */
function sendJson(message) {
  connection.send(JSON.stringify(Object.assign({
    token: session.token,
    username: session.username,
  }, message)));
}

/** Converts UNIX timestamp to ISO-formatted string. */
function unixTimeToIso(timestamp) {
  serializableDate.setTime(timestamp * 1000);
  return serializableDate.toUTCString();
}

/** Renders a received broadcast message. */
function renderMessage(message) {
  return (
    renderActivityMessage(message) ||
    renderTextContentMessage(message)
  );
}

/**
 * Renders a container for a received broadcast message.
 * If `MIN_TIMESTAMP_HEADER_DELTA` seconds have passed since the last received
 * message, the first child of the element will be a current timestamp header.
 * Otherwise empty.
 */
function renderMessageContainer(timestamp) {
  var container = document.createElement('li');
  var timestampOptional = maybeRenderTimestampHeader(timestamp);

  if (timestampOptional) {
    container.appendChild(timestampOptional);
  }

  return container;
}

/**
 * If `MIN_TIMESTAMP_HEADER_DELTA` seconds have passed since the last received
 * message, a timestamp header is returned. Otherwise `null`.
 */
function maybeRenderTimestampHeader(timestamp) {
  var delta = timestamp - session.lastMessageTimestamp;

  session.lastMessageTimestamp = timestamp;

  if (delta < MIN_TIMESTAMP_HEADER_DELTA) {
    return null;
  }

  var header = document.createElement('div');
  header.classList.add('meta');
  header.classList.add('timestamp');
  header.textContent = unixTimeToIso(timestamp);
  return header;
}

/**
 * Renders an optional activity message in format
 * `${username} ${verbPastTense}.`, e.g. "alan has joined".
 * 
 * If the message is not activity-related, `null` is returned.
 * 
 * Includes timestamp header if `MIN_TIMESTAMP_HEADER_DELTA` seconds have passed
 * since the last received message.
 */
function renderActivityMessage(message) {
  var verbPastTense = activityVerbFromMessage(message);

  if (!verbPastTense) {
    return null;
  }

  var container = renderMessageContainer(message.timestamp);
  var textContainer = document.createElement('span');

  container.classList.add('meta');
  textContainer.classList.add('activity');

  textContainer.textContent = message.username + ' ' + verbPastTense + '.';

  container.appendChild(textContainer);

  return container;
}

/**
 * Returns an optional activity verb in past tense, like "joined" when
 * `message.joined == true`.
 */
function activityVerbFromMessage(message) {
  if (message.join) {
    return 'joined';
  }
  if (message.leave) {
    return 'left';
  }
  return null;
}

/** Renders a user-generated text message. */
function renderTextContentMessage(message) {
  var container = renderMessageContainer(message.timestamp);
  container.classList.add('content');
  container.appendChild(renderBubble(message.username, message.content));
  return container;
}

/**
 * Renders a message content bubble.
 * If username matches session, the `self` classname is added for styling.
 */
function renderBubble(username, content) {
  var bubble = document.createElement('div');

  var usernameContainer = document.createElement('strong');
  var contentContainer = document.createElement('span');

  bubble.classList.add('bubble');

  if (username == session.username) {
    bubble.classList.add('self');
  }

  contentContainer.textContent = content;

  usernameContainer.classList.add('username');
  usernameContainer.textContent = username;

  bubble.appendChild(usernameContainer);
  bubble.appendChild(contentContainer);

  return bubble;
}

/**
 * Authenticates with a received session token. Swaps username form with message
 * form and sets up ping sequence.
 */
function setSession(username, token) {
  session.username = username;
  session.token = token;
  setUsernameForm.setAttribute('hidden');
  sendForm.removeAttribute('hidden');
  waitToPing();
}

/** Pings WS server after `PING_FREQ` seconds and schedules next ping. */
function waitToPing() {
  setTimeout(function() {
    sendJson({ping: true});
    waitToPing();
  }, PING_FREQ * 1000);
}

/**
 * Displays an error string before the first input field of the first visible
 * form.
 */
function displayError(error) {
  var forms = document.querySelectorAll('form');

  for (var i = 0; i < forms.length; i++) {
    var form = forms[i];

    if (!form.hasAttribute('hidden')) {
      var field = document.querySelector('input');

      var errorContainer =
        form.querySelector('.error') ||
        document.createElement('div');

      errorContainer.classList.add('error');
      errorContainer.textContent = error;

      if (!errorContainer.parentNode) {
        field.parentNode.insertBefore(errorContainer, field);
      }
      
      return;
    }
  }
}

connection = new WebSocket('ws://localhost:8080');

connection.onopen = console.log.bind(console, '[ws] open');
connection.onclose = console.log.bind(console, '[ws] close');
connection.onerror = console.error.bind(console, '[ws] error');

// Handle incoming message. See `ws.js` for shape of serialized object.
connection.onmessage = function(event) {
  var message = JSON.parse(event.data);

  if (message.error) {
    displayError(message.error);
    return;
  }

  if (message.token) {
    // Receving a session token is an acknowledged handshake. 
    setSession(message.username, message.token);
    return;
  }

  if (!session.username || !session.token) {
    return; // Not yet joined, don't display broadcasts.
  }

  // Renderable otherwise.
  document.querySelector('#messages').appendChild(renderMessage(message));
};

var setUsernameForm = document.querySelector('#set-username');
var sendForm = document.querySelector('#send');

// Authenticate content when submitting username form.
setUsernameForm.addEventListener('submit', function(event) {
  event.preventDefault();

  sendJson({
    username: document.querySelector('#username-field').value,
    join: true,
  });
});


// Send message content when submitting message form.
sendForm.addEventListener('submit', function(event) {
  event.preventDefault();
  
  var field = document.querySelector('#message-field');
  sendJson({content: field.value});
  field.value = ''; // clear
});