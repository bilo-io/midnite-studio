#!/bin/sh
# Usage: ./sheet.sh <clip-name> — 6-frame contact sheet (3x2) evenly spaced -> stills/<name>-sheet.jpg
HERE=$(cd "$(dirname "$0")" && pwd)
f="$HERE/../input/clips/$1.mp4"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
i=0
for frac in 0.05 0.22 0.4 0.58 0.76 0.95; do
  t=$(printf "%.3f" $(echo "$d*$frac" | bc -l))
  /opt/homebrew/bin/ffmpeg -v error -y -ss "$t" -i "$f" -frames:v 1 -vf "scale=800:-1,drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=28:fontcolor=yellow:box=1:boxcolor=black" -copyts "$HERE/stills/_s$i.jpg" 2>/dev/null || /opt/homebrew/bin/ffmpeg -v error -y -ss "$t" -i "$f" -frames:v 1 -vf scale=800:-1 "$HERE/stills/_s$i.jpg"
  i=$((i+1))
done
/opt/homebrew/bin/ffmpeg -v error -y $(for j in 0 1 2 3 4 5; do printf -- "-i $HERE/stills/_s$j.jpg "; done) -filter_complex "xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0" "$HERE/stills/$1-sheet.jpg"
rm -f "$HERE"/stills/_s*.jpg
echo "$HERE/stills/$1-sheet.jpg"
