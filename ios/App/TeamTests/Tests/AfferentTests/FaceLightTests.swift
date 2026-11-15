import XCTest
@testable import Afferent

/// The screen light (ios/App/App/FaceLight.swift) against a fake screen: what it sets, and that the person's own
/// brightness comes back.
final class FaceLightTests: XCTestCase {
    final class Screen {
        var brightness: Double
        var writes: [Double] = []
        init(_ b: Double) { brightness = b }
    }

    func light(_ screen: Screen) -> FaceLight {
        FaceLight(read: { screen.brightness }, write: { screen.brightness = $0; screen.writes.append($0) })
    }

    func testBeginKeepsTheOwnBrightnessAndEndPutsItBack() {
        let screen = Screen(0.3), l = light(screen)
        XCTAssertTrue(l.begin(now: 0))
        XCTAssertEqual(screen.brightness, 0.4, accuracy: 1e-9, "starts at 40 %")
        XCTAssertFalse(l.begin(now: 1), "a second begin only changes the limit")
        XCTAssertTrue(l.end())
        XCTAssertEqual(screen.brightness, 0.3, accuracy: 1e-9, "the person's own brightness is back")
        XCTAssertFalse(l.on)
        XCTAssertFalse(l.end(), "nothing to restore twice")
    }

    func testTheRoomGivesTheStartingPointOnceAfterTwoSeconds() {
        XCTAssertEqual(FaceLight.ambientLevel(lumens: 2000), 0.15, accuracy: 1e-9, "a bright room")
        XCTAssertEqual(FaceLight.ambientLevel(lumens: 1000), 0.15, accuracy: 1e-9)
        XCTAssertEqual(FaceLight.ambientLevel(lumens: 1000 / 32), 0.60, accuracy: 1e-9, "five octaves darker")
        XCTAssertEqual(FaceLight.ambientLevel(lumens: 1), 0.60, accuracy: 1e-9)
        XCTAssertEqual(FaceLight.ambientLevel(lumens: 1000 / pow(2, 2.5)), 0.375, accuracy: 1e-9, "log-linear between")
        let screen = Screen(0.2), l = light(screen)
        l.begin(now: 10)
        l.ambient(lumens: 40, now: 11.9)
        XCTAssertEqual(screen.brightness, 0.4, accuracy: 1e-9, "not before 2 s")
        l.ambient(lumens: 40, now: 12)
        XCTAssertEqual(screen.brightness, FaceLight.ambientLevel(lumens: 40), accuracy: 1e-9)
        XCTAssertFalse(l.wantsAmbient)
        l.ambient(lumens: 2000, now: 13)
        XCTAssertEqual(screen.brightness, FaceLight.ambientLevel(lumens: 40), accuracy: 1e-9, "only once")
    }

    func testTheLoopIsSlowHasADeadbandAndStaysInsideTheLimits() {
        let screen = Screen(0.2), l = light(screen)
        l.begin(now: 0)
        l.track(faceLuma: 40, now: 2.5)
        XCTAssertEqual(screen.brightness, 0.4, accuracy: 1e-9, "not before 3 s")
        l.track(faceLuma: 40, now: 3)
        XCTAssertEqual(screen.brightness, 0.41, accuracy: 1e-9, "a dark face: up, at most 0.5 s at 2 %/s")
        l.track(faceLuma: 130, now: 4)
        XCTAssertEqual(screen.brightness, 0.41, accuracy: 1e-9, "within 20 of 125: nothing")
        l.track(faceLuma: 200, now: 5)
        XCTAssertEqual(screen.brightness, 0.40, accuracy: 1e-9, "an overexposed face: down")
        for i in 0..<200 { l.track(faceLuma: 0, now: 6 + Double(i)) }
        XCTAssertEqual(screen.brightness, FaceLight.maxLevel, accuracy: 1e-9, "never over 85 %")
        for i in 0..<200 { l.track(faceLuma: 255, now: 300 + Double(i)) }
        XCTAssertEqual(screen.brightness, 0.2, accuracy: 1e-9, "never darker than the person's own brightness")
        XCTAssertTrue(screen.writes.allSatisfy { $0 >= 0.2 - 1e-9 && $0 <= FaceLight.maxLevel + 1e-9 })
        let steps = zip(screen.writes.dropFirst(), screen.writes).map { abs($0 - $1) }
        XCTAssertLessThanOrEqual(steps.dropFirst().max() ?? 0, 0.01 + 1e-9, "no step over 1 % once it follows the face")
    }

    func testANightLimitAndABrightOwnLevel() {
        let screen = Screen(0.1), l = light(screen)
        l.begin(now: 0, max: 0.35)
        XCTAssertEqual(screen.brightness, 0.35, accuracy: 1e-9, "40 % is over the night limit")
        l.ambient(lumens: 5, now: 2)
        XCTAssertEqual(screen.brightness, 0.35, accuracy: 1e-9)
        l.end()
        XCTAssertEqual(screen.brightness, 0.1, accuracy: 1e-9)
        let bright = Screen(0.9), m = light(bright)
        m.begin(now: 0)
        XCTAssertEqual(bright.brightness, 0.9, accuracy: 1e-9, "a person at 90 % keeps 90 %")
        m.track(faceLuma: 250, now: 5)
        XCTAssertEqual(bright.brightness, 0.9, accuracy: 1e-9)
        m.end()
        XCTAssertEqual(bright.brightness, 0.9, accuracy: 1e-9)
    }

    func testThePersonMovingTheBrightnessEndsItAndIsKept() {
        let screen = Screen(0.3), l = light(screen)
        l.begin(now: 0)
        screen.brightness = 0.7                      // Control Centre
        l.track(faceLuma: 40, now: 4)
        XCTAssertFalse(l.on)
        XCTAssertTrue(l.takenOver)
        XCTAssertEqual(screen.brightness, 0.7, accuracy: 1e-9, "theirs, not ours")
        XCTAssertFalse(l.end(), "and the end does not put the old level back over it")
        XCTAssertEqual(screen.brightness, 0.7, accuracy: 1e-9)
        XCTAssertTrue(l.begin(now: 10), "a new start is a new request")
        XCTAssertFalse(l.takenOver)
        let small = Screen(0.3), m = light(small)
        m.begin(now: 0)
        small.brightness = 0.45                      // within 0.1 of what it set: still its own
        m.track(faceLuma: 40, now: 4)
        XCTAssertTrue(m.on)
        m.end()
        XCTAssertEqual(small.brightness, 0.3, accuracy: 1e-9)
    }
}
