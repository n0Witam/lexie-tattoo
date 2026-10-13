const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const trustedOrigin = origin => origin === "https://script.google.com"
  || origin === "https://script.googleusercontent.com"
  || /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(origin);

export function createSubmissionAttempt(payload, previous, consentAtSubmission, crypto = globalThis.crypto) {
  const signature = JSON.stringify(payload);
  if (previous?.signature === signature) return previous;
  return { signature, payload, submissionId: crypto.randomUUID(), startedAt: Date.now(), consentAtSubmission };
}

// Apps Script's HTML runs inside Google's own sandbox iframe. Bind the ready
// sender with an unguessable nonce, then require that exact sender for its reply.
export function submitConfirmedForm(endpoint, attempt, environment = window, timeout = 40000) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(endpoint);
      if (url.origin !== "https://script.google.com" || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) throw Error();
      if (!UUID.test(attempt.submissionId)) throw Error();
    } catch { reject(new Error("CONFIG")); return; }
    const nonce = environment.crypto.randomUUID();
    url.searchParams.set("origin", environment.location.origin);
    url.searchParams.set("nonce", nonce);
    const frame = environment.document.createElement("iframe");
    frame.hidden = true;
    frame.title = "Form submission confirmation";
    let sender;
    let senderOrigin;
    let sent = false;
    let timer;
    const cleanup = () => {
      environment.clearTimeout(timer);
      environment.removeEventListener("message", receive);
      frame.remove();
    };
    const fail = code => { cleanup(); reject(new Error(code)); };
    const receive = event => {
      const data = event.data;
      if (!data || data.nonce !== nonce || !trustedOrigin(event.origin) || !event.source) return;
      if (data.type === "lexie:ready" && !sent) {
        sender = event.source;
        senderOrigin = event.origin;
        sent = true;
        sender.postMessage({ type: "lexie:submit", nonce, payload: {
          ...attempt.payload, submissionId: attempt.submissionId, startedAt: attempt.startedAt,
        } }, senderOrigin);
      } else if (data.type === "lexie:result" && sent && event.source === sender && event.origin === senderOrigin) {
        const result = data.result;
        if (result?.submissionId !== attempt.submissionId) return;
        if (result.ok !== true || result.confirmed !== true || typeof result.responseId !== "string" || !result.responseId) {
          fail("SAVE_FAILED"); return;
        }
        cleanup();
        resolve({ confirmed: true, submissionId: result.submissionId, responseId: result.responseId });
      }
    };
    environment.addEventListener("message", receive);
    timer = environment.setTimeout(() => fail("TIMEOUT"), timeout);
    frame.src = url.href;
    environment.document.body.appendChild(frame);
  });
}
