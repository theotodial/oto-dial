const MIN_LIVENESS_SCORE = 70;

export function validateSelfieLiveness(selfieLiveness) {
  if (!selfieLiveness || typeof selfieLiveness !== "object") {
    return { ok: false, error: "Live selfie verification is required." };
  }

  if (!selfieLiveness.passed) {
    return { ok: false, error: "Complete the guided live selfie verification before submitting." };
  }

  if (!selfieLiveness.sessionId || !selfieLiveness.completedAt) {
    return { ok: false, error: "Invalid liveness session. Please retake your live selfie." };
  }

  const livenessScore = Number(selfieLiveness.livenessScore);
  if (!Number.isFinite(livenessScore) || livenessScore < MIN_LIVENESS_SCORE) {
    return { ok: false, error: "Liveness verification score was too low. Please try again." };
  }

  if (
    selfieLiveness.faceMatchRequired === true &&
    selfieLiveness.faceMatchPassed !== true
  ) {
    const matchScore = Number(selfieLiveness.faceMatchScore);
    return {
      ok: false,
      error: matchScore
        ? `Selfie did not match your ID photo (${matchScore}% confidence). Please retake verification.`
        : "Selfie did not match your ID photo. Please retake verification.",
    };
  }

  return { ok: true };
}

export function normalizeSelfieLiveness(selfieLiveness) {
  if (!selfieLiveness || typeof selfieLiveness !== "object") return null;

  return {
    sessionId: String(selfieLiveness.sessionId || ""),
    completedAt: selfieLiveness.completedAt
      ? new Date(selfieLiveness.completedAt)
      : new Date(),
    passed: selfieLiveness.passed === true,
    livenessScore: Number(selfieLiveness.livenessScore) || null,
    faceMatchScore:
      selfieLiveness.faceMatchScore == null
        ? null
        : Number(selfieLiveness.faceMatchScore),
    faceMatchPassed:
      selfieLiveness.faceMatchPassed == null
        ? null
        : selfieLiveness.faceMatchPassed === true,
    faceMatchRequired: selfieLiveness.faceMatchRequired === true,
    challenges: Array.isArray(selfieLiveness.challenges)
      ? selfieLiveness.challenges.map(String)
      : [],
  };
}
