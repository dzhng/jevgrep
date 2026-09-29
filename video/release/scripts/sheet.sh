#!/bin/sh
# usage: sheet.sh dir cols out.png  -> contact sheet of every png in dir
d=$1; c=${2:-3}; o=${3:-$1/sheet.png}
n=$(ls $d/*.png | grep -v sheet | wc -l | tr -d ' ')
r=$(( (n + c - 1) / c ))
ffmpeg -loglevel error -y -pattern_type glob -i "$d/[0-9]*.png" -vf "scale=640:-1,tile=${c}x${r}:padding=6:color=black" -frames:v 1 $o
