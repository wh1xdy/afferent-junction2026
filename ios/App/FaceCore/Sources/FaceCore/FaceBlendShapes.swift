import Foundation

/// The 52 ARKit blendshape coefficients of one frame, stored inline (no heap): lane i holds
/// `FaceBlendShapes.names[i]`, lanes 52 to 63 stay 0.
public typealias FaceShapeVector = SIMD64<Float>

public enum FaceBlendShapes {
    /// ARKit's own names (ARFaceAnchor.BlendShapeLocation.rawValue), e.g. "mouthSmile_L".
    public static let names: [String] = [
        "browDown_L", "browDown_R", "browInnerUp", "browOuterUp_L", "browOuterUp_R",
        "cheekPuff", "cheekSquint_L", "cheekSquint_R",
        "eyeBlink_L", "eyeBlink_R", "eyeLookDown_L", "eyeLookDown_R", "eyeLookIn_L", "eyeLookIn_R",
        "eyeLookOut_L", "eyeLookOut_R", "eyeLookUp_L", "eyeLookUp_R", "eyeSquint_L", "eyeSquint_R",
        "eyeWide_L", "eyeWide_R",
        "jawForward", "jawLeft", "jawOpen", "jawRight",
        "mouthClose", "mouthDimple_L", "mouthDimple_R", "mouthFrown_L", "mouthFrown_R", "mouthFunnel",
        "mouthLeft", "mouthLowerDown_L", "mouthLowerDown_R", "mouthPress_L", "mouthPress_R",
        "mouthPucker", "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower",
        "mouthShrugUpper", "mouthSmile_L", "mouthSmile_R", "mouthStretch_L", "mouthStretch_R",
        "mouthUpperUp_L", "mouthUpperUp_R",
        "noseSneer_L", "noseSneer_R",
        "tongueOut",
    ]
    public static let count = 52

    /// Both spellings are accepted: ARKit's "mouthSmile_L" and the reference app's "mouthSmileLeft".
    private static let indexByName: [String: Int] = {
        var m: [String: Int] = [:]
        for (i, n) in names.enumerated() {
            m[n] = i
            if n.hasSuffix("_L") { m[String(n.dropLast(2)) + "Left"] = i }
            if n.hasSuffix("_R") { m[String(n.dropLast(2)) + "Right"] = i }
        }
        return m
    }()

    public static func index(of name: String) -> Int? { indexByName[name] }

    /// Unknown names are ignored, missing ones stay 0, values that are not finite count as 0.
    public static func vector(from shapes: [String: Float]) -> FaceShapeVector {
        var v = FaceShapeVector()
        for (name, value) in shapes {
            if let i = indexByName[name], value.isFinite { v[i] = value }
        }
        return v
    }

    private static func lane(_ name: String) -> Int {
        guard let i = indexByName[name] else { preconditionFailure("unknown blendshape \(name)") }
        return i
    }

    static let browDownL = lane("browDown_L"), browDownR = lane("browDown_R")
    static let browInnerUp = lane("browInnerUp")
    static let browOuterUpL = lane("browOuterUp_L"), browOuterUpR = lane("browOuterUp_R")
    static let cheekSquintL = lane("cheekSquint_L"), cheekSquintR = lane("cheekSquint_R")
    static let eyeBlinkL = lane("eyeBlink_L"), eyeBlinkR = lane("eyeBlink_R")
    static let eyeWideL = lane("eyeWide_L"), eyeWideR = lane("eyeWide_R")
    static let jawOpen = lane("jawOpen")
    static let mouthFrownL = lane("mouthFrown_L"), mouthFrownR = lane("mouthFrown_R")
    static let mouthPressL = lane("mouthPress_L"), mouthPressR = lane("mouthPress_R")
    static let mouthSmileL = lane("mouthSmile_L"), mouthSmileR = lane("mouthSmile_R")
    static let mouthUpperUpL = lane("mouthUpperUp_L"), mouthUpperUpR = lane("mouthUpperUp_R")
    static let noseSneerL = lane("noseSneer_L"), noseSneerR = lane("noseSneer_R")
}
