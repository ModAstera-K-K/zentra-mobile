import Foundation

struct IOSActivityHistoryCursor: Codable {
  let version: Int
  let start: String
  let end: String
  let after: String

  func encode() throws -> String { try JSONEncoder().encode(self).base64EncodedString() }

  static func decode(_ value: String?, start: String, end: String) throws -> IOSActivityHistoryCursor? {
    guard let value else { return nil }
    guard let data = Data(base64Encoded: value),
          let cursor = try? JSONDecoder().decode(Self.self, from: data),
          cursor.version == 1, cursor.start == start, cursor.end == end else {
      throw IOSActivityHistoryPage.error("Invalid activity history cursor")
    }
    return cursor
  }
}

struct IOSActivityHistoryPage {
  let requestedStart: String
  let requestedEnd: String
  let start: Date
  let end: Date
  let availableStart: Date
  let transitions: [IOSActivityTransition]

  static func error(_ message: String) -> NSError {
    NSError(domain: "ZentraActivityHistory", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  static func bounds(start: String, end: String, now: Date) throws -> (Date, Date, Date) {
    guard let first = IOSActivityTransitionHelpers.parse(start),
          let last = IOSActivityTransitionHelpers.parse(end), first <= last,
          last.timeIntervalSince(first) <= 26 * 3600, first <= now else {
      throw error("Activity history requires one bounded past calendar day")
    }
    let floor = now.addingTimeInterval(-7 * 24 * 3600)
    let finish = min(last, now)
    return (min(max(first, floor), finish), finish, floor)
  }

  func payload(after cursor: IOSActivityHistoryCursor?, limit: Int) throws -> [String: Any] {
    let offset = cursor.map { value in transitions.partitioningIndex { $0.key > value.after } } ?? 0
    let stop = min(transitions.count, offset + max(1, min(250, limit)))
    let page = transitions[offset..<stop]
    let more = stop < transitions.count
    let next = more ? try IOSActivityHistoryCursor(version: 1, start: requestedStart,
      end: requestedEnd, after: page.last!.key).encode() : nil
    return [
      "transitions": page.map { $0.payload(delivery: "history") },
      "nextCursor": next as Any? ?? NSNull(), "hasMore": more,
      "queriedStart": IOSActivityTransitionHelpers.format(start),
      "queriedEnd": IOSActivityTransitionHelpers.format(end),
      "availableStart": IOSActivityTransitionHelpers.format(availableStart),
      "truncated": (IOSActivityTransitionHelpers.parse(requestedStart) ?? start) < availableStart,
    ]
  }
}

private extension Array {
  func partitioningIndex(where predicate: (Element) -> Bool) -> Int {
    var low = 0, high = count
    while low < high {
      let middle = low + (high - low) / 2
      if predicate(self[middle]) { high = middle } else { low = middle + 1 }
    }
    return low
  }
}
