#!/bin/sh
set -eu
cd "$(dirname "$0")"
cargo build --release --locked
mkdir -p dist
cp target/release/cineminha-desktop dist/cineminha
cp README.md dist/LEIA-ME.md
cp THIRD-PARTY.md dist/THIRD-PARTY.md
cp vendor/webrtc/LICENSE-MIT dist/LICENSE-webrtc-MIT
cp vendor/webrtc/LICENSE-APACHE dist/LICENSE-webrtc-APACHE
tar -czf "dist/cineminha-linux-$(uname -m).tar.gz" -C dist cineminha LEIA-ME.md THIRD-PARTY.md LICENSE-webrtc-MIT LICENSE-webrtc-APACHE
printf '\nPronto: %s/dist/cineminha\n' "$PWD"
