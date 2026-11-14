// swift-tools-version: 5.9
import PackageDescription

// Offline tests for the finger sensor byte parser of the Capacitor app, and for the watch side
// (the 2A37 parser and device listing of AfferentWatch, the sleep arithmetic of AfferentHealth):
//   cd ios/App/FingerTests && swift test
// Sources/AfferentFingerParser/AfferentFingerParser.swift and the two files in Sources/WatchCore are
// symlinks to the files the app compiles (ios/App/App/...), so the tests run the shipped code.
let package = Package(
    name: "FingerTests",
    platforms: [.macOS(.v13), .iOS(.v15)],
    products: [
        .library(name: "AfferentFingerParser", targets: ["AfferentFingerParser"]),
        .library(name: "WatchCore", targets: ["WatchCore"]),
    ],
    targets: [
        .target(name: "AfferentFingerParser"),
        .testTarget(name: "AfferentFingerParserTests", dependencies: ["AfferentFingerParser"]),
        .target(name: "WatchCore"),
        .testTarget(name: "WatchCoreTests", dependencies: ["WatchCore"]),
    ]
)
