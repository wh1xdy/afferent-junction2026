import Foundation

/// Pixels per inch of the phone's own screen. iOS has no call for the physical size of the
/// screen: it gives the panel's pixel count (UIScreen.nativeBounds), and the pixel density is
/// a fixed property of the hardware model, which the phone reports as "iPhone15,2" (hw.machine).
/// The figures are Apple's published ones for every iPhone with a TrueDepth camera up to the
/// iPhone 16 family. A model that is not in the list gets the figure of its class (every 3x
/// iPhone since 2020 that is not a mini is 460), and the answer says so.
public enum FaceScreenDensity {
    public enum Source: String {
        /// the model is in Apple's list
        case model
        /// the model is not in the list: the figure of its screen class
        case scale
    }

    static let byModel: [String: Double] = {
        var t: [String: Double] = [:]
        for m in ["iPhone11,8", "iPhone12,1"] { t[m] = 326 }                                        // XR, 11
        for m in ["iPhone13,1", "iPhone14,4"] { t[m] = 476 }                                        // 12 mini, 13 mini
        for m in ["iPhone10,3", "iPhone10,6", "iPhone11,2", "iPhone11,4", "iPhone11,6",             // X, XS, XS Max
                  "iPhone12,3", "iPhone12,5", "iPhone13,4", "iPhone14,3", "iPhone14,8"] { t[m] = 458 }   // 11 Pro, 11/12/13 Pro Max, 14 Plus
        for m in ["iPhone13,2", "iPhone13,3", "iPhone14,5", "iPhone14,2", "iPhone14,7",             // 12, 12 Pro, 13, 13 Pro, 14
                  "iPhone15,2", "iPhone15,3", "iPhone15,4", "iPhone15,5", "iPhone16,1", "iPhone16,2",    // 14 Pro, 14 Pro Max, 15 family
                  "iPhone17,1", "iPhone17,2", "iPhone17,3", "iPhone17,4", "iPhone17,5"] { t[m] = 460 }   // 16 family
        return t
    }()

    /// - model: hw.machine, "iPhone15,2"
    /// - nativeScale: UIScreen.nativeScale
    /// - pad: the device is an iPad (every iPad with a TrueDepth camera is 264)
    public static func pixelsPerInch(model: String, nativeScale: Double, pad: Bool) -> (ppi: Double, source: Source) {
        if let known = byModel[model] { return (known, .model) }
        if pad { return (264, .scale) }
        return (nativeScale >= 2.5 ? 460 : 326, .scale)
    }

    /// The glass in metres from its pixel count.
    public static func metres(pixels: Double, ppi: Double) -> Double { pixels / ppi * 0.0254 }
}
