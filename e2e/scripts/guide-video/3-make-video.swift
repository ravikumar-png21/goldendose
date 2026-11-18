// Part 3 of the click-by-click video: joins the slide pictures and the voice recordings into one MP4.
// Uses only Apple's own AVFoundation, so nothing needs installing.
//
//   swift scripts/guide-video/3-make-video.swift <frames folder> <voice folder(s)> <output.mp4> [music file]
//
// Voice recordings can be .wav or .aiff. Several voice folders can be given, separated by commas:
// for each picture, the first folder that has a recording with the same name wins.
//
// Each slide stays on screen for as long as its narration, plus a short pause.
// With a music file, it plays quietly underneath the voice, looped, fading in and out.
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let width = 1280, height = 720
let pauseAfterEachSlide = CMTime(seconds: 0.8, preferredTimescale: 600)

// Quiet: the voice must always be clear. MUSIC_VOLUME=0.08 makes it quieter still.
let musicVolume = Float(ProcessInfo.processInfo.environment["MUSIC_VOLUME"] ?? "") ?? 0.12

let args = CommandLine.arguments
guard args.count == 4 || args.count == 5 else {
  print("Usage: swift 3-make-video.swift <frames folder> <voice folder> <output.mp4> [music file]")
  exit(1)
}
let framesDir = URL(fileURLWithPath: args[1])
let voiceDirs = args[2].split(separator: ",").map { URL(fileURLWithPath: String($0)) }
let outputURL = URL(fileURLWithPath: args[3])
let musicURL = args.count == 5 ? URL(fileURLWithPath: args[4]) : nil

// Pictures and recordings pair up by name (01-cover.png with 01-cover.aiff or 01-cover.wav).
let frameNames = ((try? FileManager.default.contentsOfDirectory(atPath: framesDir.path)) ?? [])
  .filter { $0.hasSuffix(".png") }.sorted()
let frames = frameNames.map { framesDir.appendingPathComponent($0) }
guard !frames.isEmpty else { print("No pictures in \(framesDir.path)"); exit(1) }
let voices: [URL] = frameNames.map { frame in
  let base = String(frame.dropLast(4))
  for dir in voiceDirs {
    for ext in ["wav", "aiff"] {
      let url = dir.appendingPathComponent("\(base).\(ext)")
      if FileManager.default.fileExists(atPath: url.path) { return url }
    }
  }
  print("No recording for \(frame). Each picture needs one.")
  exit(1)
}

// How long each slide stays on screen
let slideDurations: [CMTime] = voices.map { url in
  CMTimeAdd(AVURLAsset(url: url).duration, pauseAfterEachSlide)
}

// ---------- 1. A silent video of the pictures ----------
let silentURL = FileManager.default.temporaryDirectory.appendingPathComponent("goldendose-silent-\(UUID().uuidString).mp4")
let writer = try AVAssetWriter(outputURL: silentURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func pixelBuffer(for imageURL: URL) -> CVPixelBuffer {
  guard let source = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fatalError("Couldn't read \(imageURL.lastPathComponent)")
  }
  var buffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
  let pixels = buffer!
  CVPixelBufferLockBaseAddress(pixels, [])
  let context = CGContext(
    data: CVPixelBufferGetBaseAddress(pixels), width: width, height: height, bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pixels), space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  context.interpolationQuality = .high
  context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  CVPixelBufferUnlockBaseAddress(pixels, [])
  return pixels
}

func append(_ buffer: CVPixelBuffer, at time: CMTime) {
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.01) }
  adaptor.append(buffer, withPresentationTime: time)
}

var start = CMTime.zero
for (index, frameURL) in frames.enumerated() {
  let buffer = pixelBuffer(for: frameURL)
  let end = CMTimeAdd(start, slideDurations[index])
  // Repeat the picture once a second, so players can jump to any point.
  var time = start
  while CMTimeCompare(time, end) < 0 {
    append(buffer, at: time)
    time = CMTimeAdd(time, CMTime(seconds: 1, preferredTimescale: 600))
  }
  start = end
  print("\rPictures: \(index + 1) of \(frames.count)", terminator: "")
  fflush(stdout)
}
append(pixelBuffer(for: frames.last!), at: CMTimeSubtract(start, CMTime(value: 1, timescale: 600)))
input.markAsFinished()
let written = DispatchSemaphore(value: 0)
writer.finishWriting { written.signal() }
written.wait()
guard writer.status == .completed else { fatalError("Writing the video failed: \(String(describing: writer.error))") }

// ---------- 2. Add the voice, slide by slide ----------
let composition = AVMutableComposition()
let silent = AVURLAsset(url: silentURL)
let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: start),
                               of: silent.tracks(withMediaType: .video)[0], at: .zero)
let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
var cursor = CMTime.zero
for (index, voiceURL) in voices.enumerated() {
  let voice = AVURLAsset(url: voiceURL)
  if let track = voice.tracks(withMediaType: .audio).first {
    try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: voice.duration), of: track, at: cursor)
  }
  cursor = CMTimeAdd(cursor, slideDurations[index])
}

// ---------- 3. Background music, looped quietly under the voice ----------
var audioMix: AVMutableAudioMix?
if let musicURL {
  let music = AVURLAsset(url: musicURL)
  guard let musicSource = music.tracks(withMediaType: .audio).first else { fatalError("No sound in \(musicURL.lastPathComponent)") }
  let musicTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  var at = CMTime.zero
  while CMTimeCompare(at, start) < 0 {
    let piece = CMTimeMinimum(music.duration, CMTimeSubtract(start, at))
    try musicTrack.insertTimeRange(CMTimeRange(start: .zero, duration: piece), of: musicSource, at: at)
    at = CMTimeAdd(at, piece)
  }
  // Fade in over 3 seconds, stay low, fade out over the last 5 seconds.
  let volume = AVMutableAudioMixInputParameters(track: musicTrack)
  let fadeIn = CMTime(seconds: 3, preferredTimescale: 600)
  let fadeOut = CMTime(seconds: 5, preferredTimescale: 600)
  volume.setVolumeRamp(fromStartVolume: 0, toEndVolume: musicVolume, timeRange: CMTimeRange(start: .zero, duration: fadeIn))
  volume.setVolume(musicVolume, at: fadeIn)
  volume.setVolumeRamp(fromStartVolume: musicVolume, toEndVolume: 0,
                       timeRange: CMTimeRange(start: CMTimeSubtract(start, fadeOut), duration: fadeOut))
  let mix = AVMutableAudioMix()
  mix.inputParameters = [volume]
  audioMix = mix
}

// ---------- 4. Save as MP4 ----------
try? FileManager.default.removeItem(at: outputURL)
let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPreset1280x720)!
export.outputURL = outputURL
export.outputFileType = .mp4
export.audioMix = audioMix
let exported = DispatchSemaphore(value: 0)
export.exportAsynchronously { exported.signal() }
exported.wait()
try? FileManager.default.removeItem(at: silentURL)
guard export.status == .completed else { fatalError("Saving the MP4 failed: \(String(describing: export.error))") }

let minutes = Int(start.seconds) / 60, seconds = Int(start.seconds) % 60
print("\nSaved \(outputURL.path) (\(minutes) min \(seconds) s)")
