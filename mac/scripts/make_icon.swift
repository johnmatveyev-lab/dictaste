// One-time app icon generator: renders a gradient waveform icon at every
// required size into an .iconset directory. Package with:
//   swift scripts/make_icon.swift /path/to/AppIcon.iconset
//   iconutil -c icns -o FlowDictate/AppIcon.icns /path/to/AppIcon.iconset
import AppKit
import CoreGraphics
import UniformTypeIdentifiers

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"

let sizes: [(Int, String)] = [
    (16, "icon_16x16"), (32, "icon_16x16@2x"),
    (32, "icon_32x32"), (64, "icon_32x32@2x"),
    (128, "icon_128x128"), (256, "icon_128x128@2x"),
    (256, "icon_256x256"), (512, "icon_256x256@2x"),
    (512, "icon_512x512"), (1024, "icon_512x512@2x"),
]

func draw(size: Int) -> CGImage {
    let s = CGFloat(size)
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
        space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!

    // macOS icon shape: rounded square inset ~10% of the canvas.
    let inset = s * 0.098
    let rect = CGRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let radius = rect.width * 0.225
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
    ctx.clip()

    let gradient = CGGradient(
        colorsSpace: space,
        colors: [
            CGColor(red: 0.03, green: 0.30, blue: 0.18, alpha: 1),
            CGColor(red: 0.13, green: 0.70, blue: 0.40, alpha: 1),
        ] as CFArray,
        locations: [0, 1]
    )!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: 0), end: CGPoint(x: s, y: s), options: [])

    // White waveform bars, rounded caps, centered.
    let heights: [CGFloat] = [0.30, 0.55, 0.84, 0.62, 0.34]
    let barWidth = rect.width * 0.075
    let spacing = rect.width * 0.058
    let totalWidth = barWidth * CGFloat(heights.count) + spacing * CGFloat(heights.count - 1)
    var x = rect.midX - totalWidth / 2
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.96))
    for h in heights {
        let barHeight = rect.height * h * 0.60
        let barRect = CGRect(x: x, y: rect.midY - barHeight / 2, width: barWidth, height: barHeight)
        ctx.addPath(CGPath(roundedRect: barRect, cornerWidth: barWidth / 2, cornerHeight: barWidth / 2, transform: nil))
        ctx.fillPath()
        x += barWidth + spacing
    }
    return ctx.makeImage()!
}

try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
for (size, name) in sizes {
    let url = URL(fileURLWithPath: "\(outDir)/\(name).png") as CFURL
    let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, draw(size: size), nil)
    CGImageDestinationFinalize(dest)
}
print("iconset written to \(outDir)")
