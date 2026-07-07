export const VIDEO_PROFILE_VARIANTS = Object.freeze([
  { name: "full", profile: {} },
  { name: "no-portrait", profile: { disablePortrait: true } },
  { name: "simple-radar", profile: { simplifyRadar: true } },
  { name: "no-comments", profile: { disableComments: true } },
  { name: "minimal", profile: { disablePortrait: true, simplifyRadar: true, disableComments: true, disableTypeIndicators: true } },
]);

export const VIDEO_PROFILE_CONCURRENCY_SWEEP = Object.freeze(["auto", "50%", "75%", "100%", "4", "8"]);

export function safeProfileName(value) {
  return String(value || "profile").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
}

export function createProfileCases({ variants = VIDEO_PROFILE_VARIANTS, concurrencySweep = VIDEO_PROFILE_CONCURRENCY_SWEEP } = {}) {
  const cases = variants.map(variant => ({
    name: `${variant.name}-auto`,
    renderConcurrency: "auto",
    profile: variant.profile,
  }));
  for (const concurrency of concurrencySweep.filter(value => value !== "auto")) {
    cases.push({
      name: `full-${safeProfileName(concurrency)}`,
      renderConcurrency: concurrency,
      profile: {},
    });
  }
  return cases;
}
