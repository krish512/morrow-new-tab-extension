# Morrow — Chromium New Tab

A dependency-free Manifest V3 extension that replaces the new-tab page with a calm, customizable home screen. It runs in Chrome, Microsoft Edge, Brave, Vivaldi, and most other Chromium browsers.

## Install locally

1. Open your browser's extensions page:
   - Chrome / Brave / Vivaldi: `chrome://extensions`
   - Microsoft Edge: `edge://extensions`
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a new tab.

## Included

- Search via Google, DuckDuckGo, or Bing
- Compact favourite cards, using the exact SVG clip paths in `card.svg`
- Five favourite domains suggested from actual visits in the last 30 days on first setup; YouTube starts as a removable default
- Site favicons, with Chrome's cached favicon as a fallback
- A left-side Notes panel with saving, Clear note, and Undo
- A responsive layout that uses the full window with comfortable margins
- Name, light/Dusk/system appearance, and a live 12/24-hour clock
- A right-side chat panel with model selection, streamed replies, Stop, and new chat
- Keyboard-first interactions: search is focused on load, `/` refocuses it, and `Cmd/Ctrl + ,` opens settings
- Web addresses entered in search open directly; other text uses the selected search engine
- Subtle page and panel transitions, visible keyboard focus on controls, and `prefers-reduced-motion` support

After changing extension files, click **Reload** on the extensions page and open a new tab. The new history and favicon permissions may require accepting an updated browser permission prompt. No build step or runtime dependencies are required.

## Connect Ollama

1. Start Ollama and install a chat model if you do not already have one.
2. Open **Customize** and enter the local endpoint, usually `http://localhost:11434`.
3. Click **Test**, allow the browser's local-host permission request, then **Save changes**.
4. **Ask Morrow** now appears on the right. Select a model and send a message. Press Enter to send, Shift + Enter for a new line, or Stop to cancel a reply.

Leave the endpoint blank to hide Ask Morrow. Endpoints must use `localhost` or `127.0.0.1`; custom ports and HTTP/HTTPS are supported. Test checks both the model list and access to the chat route without loading a model.

### If Ollama rejects the extension with HTTP 403

Allow the extension origin in Ollama's `OLLAMA_ORIGINS` setting. A failed **Test** shows the exact `OLLAMA_ORIGINS=chrome-extension://…` value to use. You can also find the extension ID on `chrome://extensions` or `edge://extensions` with Developer mode enabled. Replace `YOUR_EXTENSION_ID` below with that ID. Preserve any origins you already allow by including them in the comma-separated value.

For a terminal-managed Ollama server, quit the running instance and start it with:

```sh
OLLAMA_ORIGINS="chrome-extension://YOUR_EXTENSION_ID" ollama serve
```

For the Ollama macOS app:

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://YOUR_EXTENSION_ID"
```

Then fully quit and reopen Ollama. Click **Test** again. Windows users can set the same environment variable in their user environment and restart Ollama; Linux service users can add it to the service environment and restart the service. See [Ollama's origin and environment configuration](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama).

The chat implementation uses Ollama's native [model list](https://docs.ollama.com/api/tags) and [streaming chat](https://docs.ollama.com/api/chat) APIs. No OpenAI API key is required.

## Storage and privacy

Settings, favourites, notes, and connection preferences are saved in this browser profile using `chrome.storage.local`. On first launch after upgrading from 1.0, existing synced settings and notes are copied into local storage. This release does not write new data to browser sync; the old synced copy is left untouched.

Chat history exists only in the current tab and is lost when it closes or reloads. Only messages you type into chat are sent to the selected Ollama endpoint. Your note, favourites, and searches are not included. Whether a selected model runs locally or uses a cloud service depends on your Ollama configuration.

On first setup, Morrow reads local browser history for the last 30 days and saves only the suggested domain links. It does not upload browsing history. Favicon requests may contact the favourite website at `/favicon.ico`; no referrer is sent. If that fails, Chromium's cached favicon is used.

## Development checks

Run the regression tests with Node.js 22 or later:

```sh
npm test
```

No package installation is needed for these tests. They cover endpoint validation, URL-or-search routing, 30-day favourite ranking, model and chat access, fragmented streams, Unicode, incomplete/error replies, and cancellation. To preview the interface outside the extension, serve this directory over local HTTP; it will use localStorage. Browser-extension permissions must be verified in a loaded extension.

## Browser behavior

Morrow overrides the **new-tab** page. A normal new window that opens a new tab will show Morrow too. Startup/session restore, the Home button, private windows, browser policies, and other new-tab extensions can change which page opens. Choose “Open the New Tab page” in your browser's startup settings if you want Morrow on startup.
