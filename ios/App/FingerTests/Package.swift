// swift-tools-version: 5.9
import PackageDescription

// Offline tests for the finger sensor byte parser of the Capacitor app:
//   cd ios/App/FingerTests && swift test
// Sources/AfferentFingerParser/AfferentFingerParser.swift is a symlink to the file the app
// compiles (ios/App/App/AfferentFingerParser.swift), so the tests run the shipped code.
let package = Package(
    name: "FingerTests",
    platforms: [.macOS(.v13), .iOS(.v15)],
    products: [
        .library(name: "AfferentFingerParser", targets: ["AfferentFingerParser"]),
    ],
    targets: [
        .target(name: "AfferentFingerParser"),
        .testTarget(name: "AfferentFingerParserTests", dependencies: ["AfferentFingerParser"]),
    ]
)
