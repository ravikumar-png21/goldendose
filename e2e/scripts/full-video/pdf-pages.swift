// Turns each page of a PDF into a 1920×1080 picture, centred on white if the page isn't 16:9.
// Uses Apple's own PDFKit, so nothing needs installing.
//
//   swift pdf-pages.swift <file.pdf> <output folder>      writes p01.png, p02.png, …
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count == 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  print("Usage: swift pdf-pages.swift <file.pdf> <output folder>")
  exit(1)
}
let outDir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let width = 1920, height = 1080
for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let box = page.bounds(for: .mediaBox)
  let scale = min(CGFloat(width) / box.width, CGFloat(height) / box.height)
  let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  context.setFillColor(.white)
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  context.interpolationQuality = .high
  context.translateBy(x: (CGFloat(width) - box.width * scale) / 2, y: (CGFloat(height) - box.height * scale) / 2)
  context.scaleBy(x: scale, y: scale)
  context.translateBy(x: -box.minX, y: -box.minY)
  page.draw(with: .mediaBox, to: context)
  let rep = NSBitmapImageRep(cgImage: context.makeImage()!)
  let file = outDir.appendingPathComponent(String(format: "p%02d.png", i + 1))
  try rep.representation(using: .png, properties: [:])!.write(to: file)
}
print("PDF pages: \(doc.pageCount)")
