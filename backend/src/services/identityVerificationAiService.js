function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeNameMatchScore(legalName, profileName) {
  const a = normalizeName(legalName);
  const b = normalizeName(profileName);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const aTokens = a.split(" ").filter(Boolean);
  const bTokens = b.split(" ").filter(Boolean);
  if (!aTokens.length || !bTokens.length) return 0;

  const overlap = aTokens.filter((token) => bTokens.includes(token)).length;
  return Math.round((overlap / Math.max(aTokens.length, bTokens.length)) * 100);
}

/**
 * Server-side AI decision using client liveness + face-match signals and profile cross-checks.
 */
export function evaluateIdentityVerificationAi({
  user,
  legalName,
  dateOfBirth,
  documentType,
  documentCountry,
  selfieLiveness,
}) {
  const profileName =
    user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

  const nameMatchScore = computeNameMatchScore(legalName, profileName);
  const livenessScore = Number(selfieLiveness?.livenessScore) || 0;
  const faceMatchScore =
    selfieLiveness?.faceMatchScore == null
      ? null
      : Number(selfieLiveness.faceMatchScore);
  const faceMatchRequired = selfieLiveness?.faceMatchRequired === true;
  const faceMatchPassed = selfieLiveness?.faceMatchPassed === true;
  const livenessPassed = selfieLiveness?.passed === true;

  const reasons = [];
  let score = 0;

  if (livenessPassed) score += 25;
  else reasons.push("Live selfie liveness not completed");

  if (livenessScore >= 70) score += 15;
  else reasons.push("Liveness confidence below threshold");

  if (livenessScore >= 85) score += 10;

  if (faceMatchRequired) {
    if (faceMatchPassed) score += 25;
    else reasons.push("Selfie did not match government ID photo");

    if (faceMatchScore != null && faceMatchScore >= 65) score += 15;
    else if (faceMatchRequired) reasons.push("Face match confidence too low");
  } else {
    score += 20;
    reasons.push("Government ID face match requires manual compliance review");
  }

  if (nameMatchScore >= 80) score += 15;
  else if (nameMatchScore >= 50) score += 8;
  else reasons.push("Legal name differs from account profile name");

  if (legalName && dateOfBirth && documentType && documentCountry) score += 10;
  else reasons.push("Incomplete identity fields");

  const overallScore = Math.min(100, score);

  const autoApproved =
    livenessPassed &&
    livenessScore >= 70 &&
    legalName &&
    dateOfBirth &&
    documentType &&
    documentCountry &&
    nameMatchScore >= 40 &&
    (!faceMatchRequired || (faceMatchPassed && (faceMatchScore == null || faceMatchScore >= 58)));

  return {
    overallScore,
    nameMatchScore,
    faceMatchScore,
    livenessScore,
    faceMatchRequired,
    faceMatchPassed,
    autoApproved,
    decision: autoApproved ? "approved" : "pending_manual",
    reasons,
    evaluatedAt: new Date(),
  };
}
