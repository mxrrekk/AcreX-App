export type MeasurementSource = {
  sourceId: string;
  label: string;
  serviceName: string;
  zoneType: string;
  quantity: number;
  unit: string;
  rate?: number | null;
};

export type SourceLinkedLine = {
  sourceId: string | null;
  sourceMeasurement: string;
  serviceName: string;
  description: string;
  zoneType: string;
  quantity: string;
  unit: string;
  rate: string;
  sourceManuallyEdited?: boolean;
  sourceChangeAvailable?: boolean;
  sourceDeleted?: boolean;
  sourceSnapshot?: Omit<MeasurementSource, "sourceId" | "rate">;
};

function numberValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchesSource(line: SourceLinkedLine, source: MeasurementSource) {
  return (
    line.sourceMeasurement === source.label &&
    line.serviceName === source.serviceName &&
    line.zoneType === source.zoneType &&
    Math.abs(numberValue(line.quantity) - source.quantity) < 0.0001 &&
    line.unit === source.unit
  );
}

export function sourceSnapshot(source: MeasurementSource) {
  return {
    label: source.label,
    serviceName: source.serviceName,
    zoneType: source.zoneType,
    quantity: source.quantity,
    unit: source.unit
  };
}

export function reconcileSourceLinkedLines<T extends SourceLinkedLine>(
  lines: T[],
  sources: MeasurementSource[]
): { lines: T[]; changed: boolean } {
  const sourcesById = new Map(sources.map((source) => [source.sourceId, source]));
  let changed = false;
  const nextLines = lines.map((line) => {
    if (!line.sourceId) return line;
    const source = sourcesById.get(line.sourceId);
    if (!source) {
      if (line.sourceDeleted && !line.sourceChangeAvailable) return line;
      changed = true;
      return { ...line, sourceDeleted: true, sourceChangeAvailable: false };
    }

    const snapshot = line.sourceSnapshot;
    const sourceChanged = snapshot
      ? snapshot.label !== source.label ||
        snapshot.serviceName !== source.serviceName ||
        snapshot.zoneType !== source.zoneType ||
        Math.abs(snapshot.quantity - source.quantity) >= 0.0001 ||
        snapshot.unit !== source.unit
      : !matchesSource(line, source);

    if (!sourceChanged) {
      if (!line.sourceDeleted && !line.sourceChangeAvailable && snapshot) return line;
      changed = true;
      return {
        ...line,
        sourceDeleted: false,
        sourceChangeAvailable: false,
        sourceSnapshot: sourceSnapshot(source)
      };
    }

    if (line.sourceManuallyEdited) {
      if (line.sourceChangeAvailable && !line.sourceDeleted) return line;
      changed = true;
      return { ...line, sourceDeleted: false, sourceChangeAvailable: true };
    }

    changed = true;
    return {
      ...line,
      sourceMeasurement: source.label,
      serviceName: source.serviceName,
      description: source.label,
      zoneType: source.zoneType,
      quantity: String(source.quantity),
      unit: source.unit,
      rate: typeof source.rate === "number" && source.rate > 0 ? String(source.rate) : line.rate,
      sourceDeleted: false,
      sourceChangeAvailable: false,
      sourceSnapshot: sourceSnapshot(source)
    };
  });

  return { lines: nextLines, changed };
}
