Weapon and C4 icons used by the demo viewer (player panel, kill feed and radar).
Transparent PNG, preferably white/light (the panel is dark), ~128 px wide or more.
The file name is the weapon class name without "weapon_":

  Rifles:     ak47  m4a1 (M4A4)  m4a1_silencer (M4A1-S)  awp  aug  famas  galilar  sg556  ssg08  g3sg1  scar20
  SMGs:       mac10  mp9  mp7  mp5sd  ump45  p90  bizon
  Heavy:      nova  xm1014  mag7  sawedoff  m249  negev
  Pistols:    glock  hkp2000 (P2000)  usp_silencer (USP-S)  p250  elite  fiveseven  tec9  cz75a  deagle  revolver
  Other:      knife (any knife)  taser  c4  defuser (defuse kit, shown on the ground)
  Kill feed:  headshot (headshot mark)  flashbang_assist (flash assist)

Grenades live in ../grenades/ (he, flash, smoke, molotov, incendiary, decoy) and serve both the tactical board
and the demo viewer (inventories, ground items and grenades in flight).

Missing file: the app shows the weapon name (or a vector icon for C4 and grenades). You do not need every file;
add them gradually. After replacing files, run "npm start" (or restart "npm run dev").
