import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
  if !condition() { fatalError(message) }
}
func sample(_ minutes: Double, _ kind: String, confidence: Double = 0.95) -> IOSActivitySample {
  IOSActivitySample(start: base.addingTimeInterval(minutes * 60), kind: kind, confidence: confidence)
}
func walkingMinutes(_ transitions: [IOSActivityTransition]) -> Double {
  var opened: Date?, total = 0.0
  for item in transitions where item.sample.kind == "walking" {
    if item.transition == "enter" { opened = item.timestamp }
    else if let start = opened { total += item.timestamp.timeIntervalSince(start) / 60; opened = nil }
  }
  return total
}

let base = IOSActivityTransitionHelpers.parse("2026-09-25T09:00:00.000Z")!
let end = base.addingTimeInterval(24 * 3600)
let unknown = IOSActivityTransitionHelpers.history([sample(0, "walking"), sample(10, "unknown"), sample(30, "still")], start: base, end: end)
expect(walkingMinutes(unknown) == 10, "Unknown periods must not extend walking")
expect(unknown.contains { $0.sample.kind == "unknown" }, "Unknown boundary must survive native payloads")
expect(IOSActivityTransitionHelpers.kind(walking: false, running: false, cycling: false, automotive: false, stationary: false, unknown: false) == "unknown", "All-false flags are unknown")
expect(IOSActivityTransitionHelpers.kind(walking: false, running: false, cycling: false, automotive: true, stationary: true, unknown: false) == "in_vehicle", "Stopped vehicles are not active")
expect(IOSActivityTransitionHelpers.kind(walking: true, running: false, cycling: false, automotive: true, stationary: false, unknown: false) == "unknown", "Conflicting physical/vehicle flags are unknown")
expect(IOSActivityTransitionHelpers.kind(walking: true, running: true, cycling: false, automotive: false, stationary: false, unknown: false) == "unknown", "Conflicting physical classifications are unknown")
expect(IOSActivityTransitionHelpers.kind(walking: false, running: false, cycling: true, automotive: false, stationary: false, unknown: false) == "on_bicycle", "Cycling is supported")

let duplicate = IOSActivityTransitionHelpers.history([sample(0, "walking"), sample(5, "walking"), sample(20, "still")], start: base, end: end)
expect(walkingMinutes(duplicate) == 20, "Duplicate starts cannot reset time")
let open = IOSActivityTransitionHelpers.history([sample(0, "walking")], start: base, end: end)
expect(open.count == 1 && open[0].transition == "enter", "Never synthesize a current-time exit")
let confidence = IOSActivityTransitionHelpers.history([sample(0, "walking", confidence: 0.35), sample(5, "walking"), sample(20, "still")], start: base, end: end)
expect(confidence.filter { $0.sample.kind == "walking" && $0.transition == "enter" }.count == 2, "Confidence threshold changes preserve evidence boundaries")
let context = IOSActivityTransitionHelpers.history([sample(-15, "walking"), sample(15, "still")], start: base, end: end)
expect(context[0].boundary && context[0].timestamp == base, "Pre-window state is bounded")
expect(context[0].payload(delivery: "history")["originalTimestamp"] as? String == IOSActivityTransitionHelpers.format(base.addingTimeInterval(-900)), "Keep original boundary timestamp")

var samples = [IOSActivitySample]()
for i in 0..<500 { samples.append(sample(Double(i), i % 2 == 0 ? "walking" : "still")) }
let transitions = IOSActivityTransitionHelpers.history(samples, start: base, end: end)
let page = IOSActivityHistoryPage(requestedStart: IOSActivityTransitionHelpers.format(base), requestedEnd: IOSActivityTransitionHelpers.format(end), start: base, end: end, availableStart: base.addingTimeInterval(-6 * 86400), transitions: transitions)
var cursor: IOSActivityHistoryCursor?, keys = Set<String>(), delivered = 0
repeat {
  let payload = try page.payload(after: cursor, limit: 250)
  let rows = payload["transitions"] as! [[String: Any]]
  expect(rows.count <= 250, "Bounded native pages")
  delivered += rows.count
  for row in rows {
    keys.insert(row["id"] as! String)
    expect(row["streamId"] as? String == "ios:core_motion", "Stable stream identity")
    expect(row["delivery"] as? String == "history", "History provenance")
  }
  if payload["hasMore"] as! Bool {
    cursor = try IOSActivityHistoryCursor.decode(payload["nextCursor"] as? String, start: page.requestedStart, end: page.requestedEnd)
  } else { break }
} while true
expect(delivered == 999 && keys.count == 999, "Pagination must preserve both transitions at a boundary")
let empty = IOSActivityHistoryPage(requestedStart: page.requestedStart, requestedEnd: page.requestedEnd, start: base, end: end, availableStart: base, transitions: [])
let emptyPayload = try empty.payload(after: nil, limit: 250)
expect(emptyPayload["hasMore"] as? Bool == false, "Empty history completes its window")
let (clamped, last, floor) = try IOSActivityHistoryPage.bounds(start: page.requestedStart, end: page.requestedEnd, now: end.addingTimeInterval(10 * 86400))
expect(clamped == last && last < floor, "Expired windows complete without querying unavailable history")
do {
  _ = try IOSActivityHistoryCursor.decode("invalid", start: page.requestedStart, end: page.requestedEnd)
  fatalError("Invalid cursor accepted")
} catch {}
print("Core Motion helper tests passed: unknown/ambiguous states, confidence, boundaries, expiry, empty reads, 999 paginated transitions.")
