// swift-tools-version: 5.9
import PackageDescription

// Face measures for the Capacitor app, ported from the native reference app (ios/Afferent):
//   cd ios/App/FaceCore && swift test
// Foundation + simd only (no ARKit, UIKit or Capacitor), so the same sources run on the Mac
// and compile inside the app target. The plugin that feeds it is ios/App/App/AfferentFace.swift.txt.
let package = Package(
    name: "FaceCore",
    platforms: [.macOS(.v13), .iOS(.v15)],
    products: [
        .library(name: "FaceCore", targets: ["FaceCore"]),
    ],
    targets: [
        .target(name: "FaceCore"),
        .testTarget(name: "FaceCoreTests", dependencies: ["FaceCore"]),
    ]
)
