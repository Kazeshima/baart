export const VIDEO_PROFILE_VARIANTS = Object.freeze([
  { name: "full", profile: {} },
  { name: "no-portrait", profile: { disablePortrait: true } },
  { name: "simple-radar", profile: { simplifyRadar: true } },
  { name: "no-comments", profile: { disableComments: true } },
  { name: "minimal", profile: { disablePortrait: true, simplifyRadar: true, disableComments: true, disableTypeIndicators: true } },
]);

export const VIDEO_PROFILE_CONCURRENCY_SWEEP = Object.freeze(["adaptive", "auto", "100%", "1", "2", "4", "6", "8", "12", "16"]);

export function safeProfileName(value) {
  return String(value || "profile").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
}

export function createProfileCases({ variants = VIDEO_PROFILE_VARIANTS, concurrencySweep = VIDEO_PROFILE_CONCURRENCY_SWEEP } = {}) {
  const cases = variants.map(variant => ({
    name: `${variant.name}-adaptive`,
    renderConcurrency: "adaptive",
    profile: variant.profile,
  }));
  for (const concurrency of concurrencySweep.filter(value => value !== "adaptive")) {
    cases.push({
      name: `full-${safeProfileName(concurrency)}`,
      renderConcurrency: concurrency,
      profile: {},
    });
  }
  cases.push({
    name: "full-adaptive-jpeg",
    renderConcurrency: "adaptive",
    imageFormat: "jpeg",
    profile: {},
  });
  return cases;
}
