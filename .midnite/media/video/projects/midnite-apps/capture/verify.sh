#!/bin/sh
# Usage: ./verify.sh <clip-name> [more...]  — ffprobe + start/middle/end stills into stills/
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
for name in "$@"; do
  f="$HERE/../input/clips/$name.mp4"
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -of csv=p=0 "$f" | sed "s/^/$name: /"
  echo "$name: duration $d"
  for pos in start mid end; do
    case $pos in start) t=0.6;; mid) t=$(printf "%.3f" $(echo "$d/2" | bc -l));; end) t=$(printf "%.3f" $(echo "$d-0.4" | bc -l));; esac
    /opt/homebrew/bin/ffmpeg -v error -y -ss "$t" -i "$f" -frames:v 1 -vf scale=1440:-1 "$HERE/stills/$name-$pos.jpg"
  done
done
