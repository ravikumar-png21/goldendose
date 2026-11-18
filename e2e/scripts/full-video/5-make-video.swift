// Step 5: turns the plan (pictures, how long each stays, which voice starts with it, how it moves)
// into one MP4, with soft music underneath. Uses only Apple's own AVFoundation, so nothing needs installing.
//
//   swift 5-make-video.swift <plan.json> <output.mp4> [music file]
//
// Movement: "zoom" pictures grow very slowly (3.5% over their time on screen), "fade" pictures fade in
// from the one before over half a second. The video fades in from black and out to black.
//
// MUSIC_VOLUME=0.06 makes the music quieter (default 0.08).
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let width = 1280, height = 720
let musicVolume = Float(ProcessInfo.processInfo.environment["MUSIC_VOLUME"] ?? "") ?? 0.08

let args = CommandLine.arguments
guard args.count == 3 || args.count == 4 else {
  print("Usage: swift 5-make-video.swift <plan.json> <output.mp4> [music file]")
  exit(1)
}
struct Shot: Decodable { let image: String; let seconds: Double; let voice: String?; let voiceAt: Double?; let zoom: Bool?; let fade: Bool? }
struct PhoneSound: Decodable { let file: String; let at: Double }
struct Plan: Decodable { let shots: [Shot]; let sounds: [PhoneSound] }
let wholePlan = try JSONDecoder().decode(Plan.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let plan = wholePlan.shots
let outputURL = URL(fileURLWithPath: args[2])
let musicURL = args.count == 4 ? URL(fileURLWithPath: args[3]) : nil
let scale: CMTimeScale = 3000
func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: scale) }

// ---------- 1. A silent video of the pictures ----------
let silentURL = FileManager.default.temporaryDirectory.appendingPathComponent("goldendose-silent-\(UUID().uuidString).mp4")
let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mp4)
// Compressed once, here, at a size that's easy to share (VIDEO_BITRATE=2000000 for sharper, bigger files).
let bitrate = Int(ProcessInfo.processInfo.environment["VIDEO_BITRATE"] ?? "") ?? 1_400_000
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bitrate,
    AVVideoMaxKeyFrameIntervalKey: 60,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
  ],
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let fps = 30.0
let fadeSeconds = 0.5
let zoomBy = 0.035
let endFade = 1.0

func load(_ path: String) -> CGImage {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("Couldn't read \(path)") }
  return image
}
// Draws a picture filling the frame, enlarged by `scale` around its centre.
func draw(_ image: CGImage, scale: Double, alpha: Double, in context: CGContext) {
  let w = Double(width) * scale, h = Double(height) * scale
  context.setAlpha(alpha)
  context.draw(image, in: CGRect(x: (Double(width) - w) / 2, y: (Double(height) - h) / 2, width: w, height: h))
}
func frame(_ paint: (CGContext) -> Void) -> CVPixelBuffer {
  var buffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
  let pixels = buffer!
  CVPixelBufferLockBaseAddress(pixels, [])
  let context = CGContext(
    data: CVPixelBufferGetBaseAddress(pixels), width: width, height: height, bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pixels), space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  context.interpolationQuality = .high
  context.setFillColor(CGColor(gray: 0, alpha: 1))
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  paint(context)
  CVPixelBufferUnlockBaseAddress(pixels, [])
  return pixels
}
func append(_ buffer: CVPixelBuffer, at t: CMTime) {
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
  adaptor.append(buffer, withPresentationTime: t)
}

let totalSeconds = plan.reduce(0) { $0 + $1.seconds }
var starts: [Double] = []
var clock = 0.0
var previous: (image: CGImage, scale: Double)? = nil
for (index, shot) in plan.enumerated() {
  starts.append(clock)
  let image = load(shot.image)
  let zoom = shot.zoom ?? false, fade = shot.fade ?? false
  let scaleAt = { (t: Double) in zoom ? 1 + zoomBy * t / shot.seconds : 1 }
  // Smooth movement needs 30 pictures a second; a still picture only needs one a second.
  let moving = { (t: Double) in zoom || (fade && t < fadeSeconds) || clock + t < 1 || clock + t > totalSeconds - endFade }
  var t = 0.0
  while t < shot.seconds - 0.0005 {
    let fadeIn = fade ? min(1, t / fadeSeconds) : 1
    let fromBlack = min(1, (clock + t) / endFade), toBlack = min(1, (totalSeconds - clock - t) / endFade)
    let buffer = frame { context in
      if fadeIn < 1, let previous { draw(previous.image, scale: previous.scale, alpha: 1, in: context) }
      draw(image, scale: scaleAt(t), alpha: fadeIn, in: context)
      let black = 1 - min(fromBlack, toBlack)
      if black > 0 {
        context.setAlpha(black)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
      }
    }
    append(buffer, at: time(clock + t))
    if moving(t) {
      t += 1 / fps
    } else {
      // Jump ahead a second, but not past the moment the end fade starts.
      let endStarts = totalSeconds - endFade - clock
      t = (t < endStarts && t + 1 > endStarts) ? endStarts : t + 1
    }
  }
  previous = (image, scaleAt(shot.seconds))
  clock += shot.seconds
  if index % 20 == 0 || index == plan.count - 1 {
    print("\rPictures: \(index + 1) of \(plan.count)", terminator: "")
    fflush(stdout)
  }
}
let total = time(clock)
append(frame { _ in }, at: CMTimeSubtract(total, CMTime(value: 1, timescale: scale)))
input.markAsFinished()
let written = DispatchSemaphore(value: 0)
writer.finishWriting { written.signal() }
written.wait()
guard writer.status == .completed else { fatalError("Writing the video failed: \(String(describing: writer.error))") }

// ---------- 2. The voice, each recording starting with its picture ----------
let composition = AVMutableComposition()
let silent = AVURLAsset(url: silentURL)
let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: total), of: silent.tracks(withMediaType: .video)[0], at: .zero)
let voiceTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
for (index, shot) in plan.enumerated() {
  guard let path = shot.voice else { continue }
  let voice = AVURLAsset(url: URL(fileURLWithPath: path))
  guard let track = voice.tracks(withMediaType: .audio).first else { fatalError("No sound in \(path)") }
  try voiceTrack.insertTimeRange(CMTimeRange(start: .zero, duration: voice.duration), of: track, at: time(starts[index] + (shot.voiceAt ?? 0)))
}

// ---------- 2b. The phone's own sounds: the alarm chime, and the phone reading aloud ----------
let soundTrack = wholePlan.sounds.isEmpty ? nil : composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
for phoneSound in wholePlan.sounds {
  let asset = AVURLAsset(url: URL(fileURLWithPath: phoneSound.file))
  guard let track = asset.tracks(withMediaType: .audio).first else { fatalError("No sound in \(phoneSound.file)") }
  try soundTrack!.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: track, at: time(phoneSound.at))
}

// ---------- 3. Background music, looped quietly under the voice ----------
var audioMix: AVMutableAudioMix?
if let musicURL {
  let music = AVURLAsset(url: musicURL)
  guard let source = music.tracks(withMediaType: .audio).first else { fatalError("No sound in \(musicURL.lastPathComponent)") }
  let musicTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  var at = CMTime.zero
  while CMTimeCompare(at, total) < 0 {
    let piece = CMTimeMinimum(music.duration, CMTimeSubtract(total, at))
    try musicTrack.insertTimeRange(CMTimeRange(start: .zero, duration: piece), of: source, at: at)
    at = CMTimeAdd(at, piece)
  }
  // Fade in over 3 seconds, stay low, fade out over the last 5 seconds.
  let volume = AVMutableAudioMixInputParameters(track: musicTrack)
  volume.setVolumeRamp(fromStartVolume: 0, toEndVolume: musicVolume, timeRange: CMTimeRange(start: .zero, duration: time(3)))
  volume.setVolume(musicVolume, at: time(3))
  volume.setVolumeRamp(fromStartVolume: musicVolume, toEndVolume: 0, timeRange: CMTimeRange(start: CMTimeSubtract(total, time(5)), duration: time(5)))
  let mix = AVMutableAudioMix()
  mix.inputParameters = [volume]
  audioMix = mix
}
// The phone's sounds a little quieter, so they sit at the same level as Bella.
if let soundTrack {
  let phone = AVMutableAudioMixInputParameters(track: soundTrack)
  phone.setVolume(0.65, at: .zero)
  audioMix = audioMix ?? AVMutableAudioMix()
  audioMix!.inputParameters += [phone]
}

// ---------- 4. Save as MP4 ----------
// First mix all the sound (voice, phone sounds, music) into one file. Then put that next to the
// pictures without compressing the pictures a second time ("passthrough"), so the file stays small.
func runExport(_ session: AVAssetExportSession, _ what: String) {
  let done = DispatchSemaphore(value: 0)
  session.exportAsynchronously { done.signal() }
  done.wait()
  guard session.status == .completed else { fatalError("\(what) failed: \(String(describing: session.error))") }
}
let mixedURL = FileManager.default.temporaryDirectory.appendingPathComponent("goldendose-sound-\(UUID().uuidString).m4a")
let soundExport = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A)!
soundExport.outputURL = mixedURL
soundExport.outputFileType = .m4a
soundExport.audioMix = audioMix
runExport(soundExport, "Mixing the sound")

let final = AVMutableComposition()
let finalVideo = final.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try finalVideo.insertTimeRange(CMTimeRange(start: .zero, duration: total), of: silent.tracks(withMediaType: .video)[0], at: .zero)
let mixed = AVURLAsset(url: mixedURL)
let finalSound = final.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try finalSound.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(mixed.duration, total)), of: mixed.tracks(withMediaType: .audio)[0], at: .zero)

try? FileManager.default.removeItem(at: outputURL)
let export = AVAssetExportSession(asset: final, presetName: AVAssetExportPresetPassthrough)!
export.outputURL = outputURL
export.outputFileType = .mp4
runExport(export, "Saving the MP4")
try? FileManager.default.removeItem(at: silentURL)
try? FileManager.default.removeItem(at: mixedURL)
let megabytes = ((try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size] as? Int) ?? 0) / 1_048_576
print("\nSaved \(outputURL.path) (\(Int(clock) / 60) min \(Int(clock) % 60) s, \(megabytes) MB)")
