# Afferent for iPhone

Contact-free pulse from the front camera, on the phone itself (nothing leaves the device).
Same pipeline as the Jetson (`jetson/vision/rppg.py`, validated at 1.8 BPM vs a finger sensor):
Vision face landmarks → forehead + both cheeks → luma-percentile skin filter → POS → 45–180 BPM,
plus the single-camera trust score (face-region agreement, SNR, stability, stillness, exposure).

The white screen at full brightness is the light source; exposure, white balance and focus lock
2.5 s after start ("Re-lock camera" redoes it).

## Run on your iPhone (once, ~3 min)

1. Plug the iPhone into the Mac, unlock it, tap **Trust**.
2. iPhone: Settings › Privacy & Security › **Developer Mode** → on (restarts the phone).
3. `open ios/Afferent.xcodeproj` → target *Afferent* › Signing & Capabilities → **Team**: your
   Apple ID (Add Account… if empty). A free Apple ID works (the app then expires after 7 days).
4. Pick the iPhone as destination, press ▶. First launch: iPhone Settings › General ›
   VPN & Device Management → trust your developer certificate.

After that, Xcode › Window › Devices › "Connect via network" lets you deploy without the cable.

## Develop

```sh
brew install xcodegen && cd ios && xcodegen generate   # after adding files
xcodebuild test -project Afferent.xcodeproj -scheme Afferent -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```
