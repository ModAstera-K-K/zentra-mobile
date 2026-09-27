import CoreMotion

extension IOSActivitySample {
  init(_ activity: CMMotionActivity) {
    let confidence: Double
    switch activity.confidence {
    case .low: confidence = 0.35
    case .medium: confidence = 0.65
    case .high: confidence = 0.95
    @unknown default: confidence = 0.5
    }
    self.init(start: activity.startDate,
      kind: IOSActivityTransitionHelpers.kind(walking: activity.walking, running: activity.running,
        cycling: activity.cycling, automotive: activity.automotive,
        stationary: activity.stationary, unknown: activity.unknown), confidence: confidence)
  }
}
