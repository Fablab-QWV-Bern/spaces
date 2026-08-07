#!/usr/bin/env bash
#
# Produces the raster forms of `public/favicon.svg`. The SVG is the source; what
# is written here is only what cannot read it.
#
# Why a shell script and not a step in the build: this runs once every few years,
# when the mark changes. A dependency in `package.json` that rasterises SVG
# (sharp, resvg) would then be installed on every `npm ci` and travel through
# every CI run for it. ImageMagick sits on the developer machine, not in the
# project — and if it is missing, the committed files are still there.
#
# Each size is rendered from the SVG separately rather than scaled down from one
# large raster: at 16 pixels the difference between the two is visible, because
# the renderer can align the bar edges to the pixel grid while a downscale can
# only average them.
#
#     brew install imagemagick
#     ./scripts/generate-favicon.sh
set -euo pipefail

cd "$(dirname "$0")/.."
public=public
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# ImageMagick rasterises the SVG once at its natural size and scales that raster
# to whatever `-resize` asks for. From a 32-pixel document a 512-pixel tile is
# then a blur. What decides how finely it is rendered is the density: 96 gives
# the natural size, so a multiple of 96 gives a multiple of that size. The
# natural size is read off rather than written down — a re-export with a
# different viewBox would otherwise quietly go soft again. `-resize` stays as a
# safety net for sizes that leave a remainder in that division.
natural=$(magick identify -format '%w' "$public/favicon.svg")

# First argument the edge length, everything after it goes to `magick` as it
# stands — further operators and the output file.
render() {
  magick -background none -density "$((96 * $1 / natural))" "$public/favicon.svg" \
    -resize "${1}x${1}" "${@:2}"
}

# 16 for the tab, 32 for the bookmark bar, 48 for the Windows desktop shortcut.
for size in 16 32 48; do
  render "$size" "$tmp/$size.png"
done
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$public/favicon.ico"

# Whoever puts the mark on a home screen ignores the SVG and rounds the corners
# themselves — iOS with its own radius, Android with the mask from the manifest.
# Hence full bleed: the tile colour is flattened into the transparent corners,
# otherwise a second, larger radius would show through as a black notch beneath
# the system's own. `-depth 8` because the renderer works at 16 bits per channel
# and would also write them: four flat colours in double precision, for a
# fivefold file.
tile() {
  render "$1" -background '#fff' -alpha remove -alpha off \
    -depth 8 -strip "$public/$2"
}

# 180 is what iOS asks for. The other two belong to the manifest: 192 lands on
# the home screen, 512 on the splash screen Android draws while the application
# starts. Both are declared `purpose: any` and therefore not cropped — a
# `maskable` icon would have to keep its content inside the middle 80 per cent,
# and the bars of this mark run off the edge on purpose.
tile 180 apple-touch-icon.png
tile 192 icon-192.png
tile 512 icon-512.png

magick identify "$public/favicon.ico" "$public/apple-touch-icon.png" \
  "$public/icon-192.png" "$public/icon-512.png"
