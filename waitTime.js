function estimateWait(position, duration) {
  if (!Number.isInteger(position) || position < 1) {
    throw new Error("Position must be a positive whole number.");
  }

  if (!Number.isInteger(duration) || duration < 1) {
    throw new Error("Service duration must be a positive whole number.");
  }

  return (position - 1) * duration;
}

module.exports = { estimateWait };
