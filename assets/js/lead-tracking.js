const seen = new Set();
export const hasAnalyticsConsent = () => window.lexieConsent?.hasAnalyticsConsent() === true;

export function trackConfirmedLead(receipt, { formType, consentAtSubmission }, environment = window) {
  if (receipt?.confirmed !== true || typeof receipt.responseId !== "string" || !receipt.responseId
    || !["contact", "available_design"].includes(formType)) return false;
  if (seen.has(receipt.responseId)) return false;
  // Consume unconsented receipts too: never replay them after a later opt-in.
  seen.add(receipt.responseId);
  if (!consentAtSubmission || environment.lexieConsent?.hasAnalyticsConsent() !== true) return false;
  try {
    environment.dataLayer.push({
      event: "generate_lead",
      form_type: formType,
      page_language: environment.document.documentElement.lang === "en" ? "en" : "pl",
    });
    return true;
  } catch {
    // Measurement must never turn a successfully saved message into a UI error.
    return false;
  }
}
