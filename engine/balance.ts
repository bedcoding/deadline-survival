export type ZombieCfg = {
  sight: number;
  nearSight: number;
  coneCos: number;
  hearing: number;
  speed: number;
  investigateTurns: number;
  searchTurns: number;
};

export type CombatCfg = {
  enemyHp: number;
  headDamage: number;
  torsoDamage: number;
  limbDamage: number;
  biteDamage: number;
  lungeDamage: number;
  fleeStunMs: number;
  fleeNoise: number;
  radioNoise: number;
  motionMs: number;
  defenseWindowMs: number;
  parryWindowStart: number;
  parryWindowEnd: number;
  parryDamage: number;
  guardDamageReduction: number;
};

export type NightCfg = {
  durationMs: number;
  waveMs: number;
  maxBarrier: number;
  coreHp: number;
  baseMaterials: number;
  repairAmount: number;
  repairCooldownMs: number;
  decoyMs: number;
  sealMs: number;
  breachResetBarrier: number;
  breachGraceMs: number;
  activeLaneDamageMul: number;
  pressureDamagePerSecond: number;
  basePressure: number;
  threatPressure: number;
  wavePressure: number;
  baseThreat: number;
  noiseThreat: number;
  spottedThreat: number;
  wokeThreat: number;
  bittenThreat: number;
  lingerStartMs: number;
  lingerThreatPerSecond: number;
};

export type Balance = {
  player: { hp: number; sight: number; bottles: number; bagLarge: number; bagSmall: number };
  noise: Record<string, number>;
  zombies: Record<string, ZombieCfg>;
  threat: Record<string, number>;
  grab: Record<string, number>;
  gate: Record<string, number>;
  combat: CombatCfg;
  night: NightCfg;
};
