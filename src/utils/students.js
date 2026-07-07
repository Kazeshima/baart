export function parseStudents(raw) {
  const applyWeaponAdaptation = (student, terrainKey, baseValue) => {
    const weapon = student.Weapon || {};
    if (weapon.AdaptationType !== terrainKey || typeof weapon.AdaptationValue !== "number") return undefined;
    return Math.min(5, (baseValue ?? 0) + weapon.AdaptationValue);
  };

  return Object.values(raw)
    .filter(student => student.IsReleased?.[0] === true)
    .map(student => ({
      id: student.Id,
      name: student.Name || student.DevName,
      familyName: student.FamilyName || "",
      personalName: student.PersonalName || "",
      devName: student.DevName,
      school: student.School,
      squadType: student.SquadType,
      tacticRole: student.TacticRole,
      position: student.Position,
      bulletType: student.BulletType,
      armorType: student.ArmorType,
      weaponType: student.WeaponType,
      range: student.Range,
      cover: student.Cover,
      equipment: student.Equipment || [],
      streetAdapt: student.StreetBattleAdaptation,
      outdoorAdapt: student.OutdoorBattleAdaptation,
      indoorAdapt: student.IndoorBattleAdaptation,
      ueStreetAdapt: student.StreetBattleAdaptationAfterUG ?? applyWeaponAdaptation(student, "Street", student.StreetBattleAdaptation),
      ueOutdoorAdapt: student.OutdoorBattleAdaptationAfterUG ?? applyWeaponAdaptation(student, "Outdoor", student.OutdoorBattleAdaptation),
      ueIndoorAdapt: student.IndoorBattleAdaptationAfterUG ?? applyWeaponAdaptation(student, "Indoor", student.IndoorBattleAdaptation),
      weaponAdaptationType: student.Weapon?.AdaptationType,
      weaponAdaptationValue: student.Weapon?.AdaptationValue,
      starGrade: student.StarGrade,
    }))
    .sort((a, b) => a.id - b.id);
}
