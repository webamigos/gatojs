type FieldRange = readonly [min: number, max: number];

const FIELD_RANGES: readonly FieldRange[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

const ITEM_PATTERN = /^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/;

export function splitCronFields(expression: string): string[] {
  const trimmed = expression.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/);
}

function itemBounds(
  start: string | undefined,
  end: string | undefined,
  range: FieldRange,
): FieldRange {
  if (start === undefined) {
    return range;
  }
  return [Number(start), Number(end ?? start)];
}

function isValidItem(item: string, range: FieldRange): boolean {
  const match = ITEM_PATTERN.exec(item);
  if (match === null) {
    return false;
  }
  const [, start, end, step] = match;
  const [low, high] = itemBounds(start, end, range);
  const [min, max] = range;
  const stepValue = Number(step ?? 1);
  return (
    low >= min &&
    high <= max &&
    low <= high &&
    stepValue >= 1 &&
    stepValue <= max
  );
}

function isValidField(field: string, range: FieldRange): boolean {
  return field.split(",").every((item) => isValidItem(item, range));
}

export function isFiveFieldCron(expression: string): boolean {
  const fields = splitCronFields(expression);
  return (
    fields.length === FIELD_RANGES.length &&
    FIELD_RANGES.every((range, index) => isValidField(fields[index], range))
  );
}
