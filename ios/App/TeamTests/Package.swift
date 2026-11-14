// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TeamTests",
    platforms: [.macOS(.v13), .iOS(.v17)],
    targets: [
        .target(name: "Afferent"),
        .testTarget(name: "AfferentTests", dependencies: ["Afferent"]),
    ]
)
