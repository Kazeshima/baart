import assert from "node:assert/strict";
import test from "node:test";
import { createStudentRatingPresentation } from "../src/utils/presentationModel.js";

const student = {
  id: 10121,
  name: "紫草（泳装）",
  familyName: "勘解由小路",
  personalName: "紫草",
  devName: "Yukari_Swimsuit",
  school: "Hyakkiyako",
  squadType: "Main",
  tacticRole: "Supporter",
  bulletType: "Mystic",
  armorType: "LightArmor",
  cover: true,
  weaponType: "SR",
  range: 750,
  streetAdapt: 4,
  ueStreetAdapt: 5,
  outdoorAdapt: 2,
  ueOutdoorAdapt: 2,
  indoorAdapt: 3,
  ueIndoorAdapt: 3,
};

const ratings = {
  blindshot: "S",
  counter: "A",
  defense: "B",
  counterDef: "C",
  cost: "D",
  overall: 3,
  overallScore: 4.2,
  dimensionWeightShares: { blindshot: 25, counter: 20, defense: 20, counterDef: 20, cost: 15 },
  notes: "Arena note",
};

test("presentation model centralizes localized identity, facts, terrain, radar, and overall data", () => {
  const zh = createStudentRatingPresentation({ student, ratings, language: "zh", activeSeason: "Street" });
  assert.equal(zh.identity.displayName, "勘解由小路  紫草（泳装）");
  assert.equal(zh.identity.schoolLabel, "百鬼夜行联合学园");
  assert.equal(zh.identity.schoolIcon, "/assets/schoolicon/Hyakkiyako.png");
  assert.equal(zh.role.squadLabel, "前排 Striker");
  assert.equal(zh.role.summary, "前排 Striker / 辅助");
  assert.equal(zh.facts.attack.label, "神秘");
  assert.equal(zh.facts.cover.label, "掩体");
  assert.equal(zh.weapon.label, "狙击步枪");
  assert.equal(zh.weapon.summary, "SR 狙击步枪 / 射程 750");
  assert.equal(zh.terrains[0].active, true);
  assert.equal(zh.terrains[0].hasUpgrade, true);
  assert.equal(zh.terrains[0].upgradedLevel, 5);
  assert.equal(zh.dimensions[0].label, "盲打威力");
  assert.equal(zh.dimensions[0].tierColor, "#f0b429");
  assert.equal(zh.dimensions[0].weightLabel, "25%");
  assert.strictEqual(zh.radar.dimensions, zh.dimensions);
  assert.equal(zh.radar.fillColor, zh.overall.color);
  assert.deepEqual(zh.weights.dimensions[0], {
    key: "blindshot",
    label: "盲打威力",
    weightShare: 25,
    weightLabel: "25%",
  });
  assert.equal(zh.overall.label, "顶级");
  assert.equal(zh.overall.score, 4.2);
});

test("presentation model preserves English naming and ETC school fallback", () => {
  const en = createStudentRatingPresentation({
    student: { ...student, name: "Yukari (Swimsuit)", familyName: "Kadenokouji", personalName: "Yukari", school: "Sakugawa" },
    ratings,
    language: "en",
    activeSeason: "Indoor",
  });
  assert.equal(en.identity.displayName, "Kadenokouji Yukari (Swimsuit)");
  assert.equal(en.identity.schoolIcon, "/assets/schoolicon/ETC.png");
  assert.equal(en.facts.defense.label, "Light");
  assert.equal(en.terrains[2].active, true);
  assert.equal(en.dimensions[1].label, "Counter");
  assert.equal(en.overall.label, "Alpha");
});
