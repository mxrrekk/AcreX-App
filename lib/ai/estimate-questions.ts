export type EstimateServiceType =
  | "Mowing"
  | "Brush Clearing / Forestry Mulching"
  | "Fence Installation"
  | "Gravel Driveway"
  | "House Pad"
  | "Land Clearing";

export type EstimateQuestion = {
  id: string;
  label: string;
  options: string[];
};

export const estimateQuestionCatalog: Record<EstimateServiceType, EstimateQuestion[]> = {
  Mowing: [
    { id: "serviceFrequency", label: "One-time or recurring service?", options: ["One-time", "Weekly", "Biweekly", "Monthly"] },
    { id: "mowingHeight", label: "Desired mowing height?", options: ["2–3 inches", "3–4 inches", "4–5 inches", "No preference"] },
    { id: "obstacles", label: "Obstacles on the mowing area?", options: ["None", "Light", "Moderate", "Many"] },
    { id: "edging", label: "Edging required?", options: ["Yes", "No"] },
    { id: "weedEating", label: "Weed eating required?", options: ["Yes", "No"] },
    { id: "blowingCleanup", label: "Blowing cleanup required?", options: ["Yes", "No"] },
    { id: "gateAccess", label: "Gate access?", options: ["Open access", "Standard gate", "Narrow gate", "No gate access"] },
    { id: "clippings", label: "Clippings hauled away or mulched?", options: ["Mulch", "Haul away", "Leave in place"] }
  ],
  "Brush Clearing / Forestry Mulching": [
    { id: "density", label: "Brush density?", options: ["Light", "Medium", "Heavy"] },
    { id: "stumps", label: "Stumps included?", options: ["Leave stumps", "Cut flush", "Remove", "Grind"] },
    { id: "clearingExtent", label: "Selective clearing or full clearing?", options: ["Selective", "Full clearing"] },
    { id: "haulOff", label: "Haul-off required?", options: ["None", "Partial", "Full"] },
    { id: "debrisFinish", label: "Burn pile or leave mulch?", options: ["Leave mulch", "Burn pile", "Haul debris"] },
    { id: "wetAreas", label: "Wet areas present?", options: ["No", "Some", "Significant"] },
    { id: "equipmentAccess", label: "Equipment access?", options: ["Easy", "Moderate", "Difficult"] },
    { id: "utilityEasements", label: "Utility easements or marked utilities?", options: ["None known", "Marked", "Not confirmed"] }
  ],
  "Fence Installation": [
    { id: "fenceMaterial", label: "Fence material?", options: ["Wood", "Vinyl", "Chain Link", "Aluminum"] },
    { id: "fenceHeight", label: "Fence height?", options: ["4 ft", "5 ft", "6 ft", "8 ft"] },
    { id: "gates", label: "Gates?", options: ["None", "Single gate", "Double gate", "Multiple gates"] },
    { id: "existingFenceRemoval", label: "Existing fence removal?", options: ["None", "Partial", "Full"] },
    { id: "concreteFootings", label: "Concrete footings?", options: ["All posts", "Gate/corner posts", "No concrete", "Not confirmed"] },
    { id: "cornerPosts", label: "Corner posts confirmed?", options: ["Yes", "No", "Not confirmed"] },
    { id: "terrainIssues", label: "Terrain issues?", options: ["Flat", "Sloped", "Rocky", "Mixed"] }
  ],
  "Gravel Driveway": [
    { id: "installationType", label: "New install or refresh?", options: ["New install", "Refresh", "Repair"] },
    { id: "gravelType", label: "Gravel type?", options: ["Crusher run", "Road base", "Limestone", "River rock", "Not selected"] },
    { id: "gravelDepth", label: "Desired gravel depth?", options: ["2 inches", "3 inches", "4 inches", "6 inches"] },
    { id: "basePrep", label: "Base prep required?", options: ["None", "Light grading", "Full base prep", "Geotextile + base"] },
    { id: "culvert", label: "Culvert installation?", options: ["No", "Existing culvert", "New culvert", "Not confirmed"] },
    { id: "grading", label: "Grading included?", options: ["Yes", "No"] },
    { id: "compaction", label: "Compaction required?", options: ["Yes", "No"] }
  ],
  "House Pad": [
    { id: "finishedDimensions", label: "Finished dimensions confirmed?", options: ["From drawing", "Confirmed separately", "Not confirmed"] },
    { id: "fillDirt", label: "Fill dirt needed?", options: ["None", "Small amount", "Moderate", "Significant"] },
    { id: "existingClearing", label: "Existing clearing required?", options: ["None", "Brush", "Trees", "Full clearing"] },
    { id: "compactionRequirements", label: "Compaction requirements?", options: ["Standard", "Engineered", "Not confirmed"] },
    { id: "elevationTarget", label: "Elevation target confirmed?", options: ["Yes", "No"] },
    { id: "drainageRequirements", label: "Drainage requirements?", options: ["None known", "Swales", "Culvert", "Engineered drainage", "Not confirmed"] }
  ],
  "Land Clearing": [
    { id: "clearingExtent", label: "Selective or full clearing?", options: ["Selective", "Full clearing"] },
    { id: "treeDiameter", label: "Trees over a specified diameter?", options: ["No", "Under 6 inches", "6–12 inches", "Over 12 inches", "Not confirmed"] },
    { id: "stumpRemoval", label: "Stump removal?", options: ["Leave", "Cut flush", "Remove", "Grind"] },
    { id: "haulOff", label: "Haul-off?", options: ["None", "Partial", "Full"] },
    { id: "burn", label: "Burn debris?", options: ["No", "Burn pile", "Burn and bury", "Not confirmed"] },
    { id: "finishGrade", label: "Finish grade?", options: ["Rough grade", "Fine grade", "No grading"] },
    { id: "debrisDisposal", label: "Debris disposal?", options: ["Leave on site", "Haul to disposal", "Chip/mulch", "Not confirmed"] }
  ]
};

export const essentialEstimateQuestionIds: Record<EstimateServiceType, string[]> = {
  Mowing: ["serviceFrequency", "edging", "weedEating", "blowingCleanup"],
  "Brush Clearing / Forestry Mulching": ["density", "haulOff", "stumps"],
  "Fence Installation": ["fenceMaterial", "fenceHeight", "gates"],
  "Gravel Driveway": ["gravelType", "gravelDepth", "grading"],
  "House Pad": ["finishedDimensions", "fillDirt", "compactionRequirements"],
  "Land Clearing": ["clearingExtent", "stumpRemoval", "haulOff"]
};

export function estimateQuestionKey(service: EstimateServiceType, questionId: string) {
  return `${service}:${questionId}`;
}

export function detectEstimateServices(values: Array<string | null | undefined>) {
  const context = values.filter(Boolean).join(" ").toLowerCase();
  const services: EstimateServiceType[] = [];
  const add = (service: EstimateServiceType) => {
    if (!services.includes(service)) services.push(service);
  };

  if (/\b(mow|mowing|grass|lawn)\b/.test(context)) add("Mowing");
  if (/\b(forestry mulch|mulching|timber mulch|brush|underbrush|vegetation clearing)\b/.test(context)) {
    add("Brush Clearing / Forestry Mulching");
  }
  if (/\b(fence|fencing|chain link|vinyl|aluminum)\b/.test(context)) add("Fence Installation");
  if (/\b(driveway|gravel|culvert|road base|crusher run)\b/.test(context)) add("Gravel Driveway");
  if (/\b(house pad|building pad|site pad)\b/.test(context)) add("House Pad");
  if (/\b(land clearing|clear lot|lot clearing|tree clearing)\b/.test(context)) add("Land Clearing");

  return services;
}
