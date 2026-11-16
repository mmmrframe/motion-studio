"""Проверка результата перед выдачей: формат, длительность, звук."""
import json, subprocess, sys

path, req_path = sys.argv[1], sys.argv[2]
req = json.load(open(req_path, encoding="utf-8"))
info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                                 capture_output=True, text=True, check=True).stdout)
v = next(s for s in info["streams"] if s["codec_type"] == "video")
a = [s for s in info["streams"] if s["codec_type"] == "audio"]
dur = float(info["format"]["duration"])
err = []
if v["codec_name"] != "h264": err.append(f"кодек {v['codec_name']}, нужен h264")
if (v["width"], v["height"]) != (1920, 1080): err.append(f"размер {v['width']}x{v['height']}")
if abs(dur - req["source"]["duration"]) > 2: err.append(f"длительность {dur:.1f} с против исходных {req['source']['duration']}")
if req["sound"]["mode"] == "mute" and a: err.append("звук должен быть удалён")
if req["sound"]["mode"] != "mute" and not a: err.append("нет аудиодорожки")
if err: sys.exit("Проверка не пройдена: " + "; ".join(err))
print(f"OK: {v['width']}x{v['height']} h264, {dur:.1f} с, аудио: {bool(a)}")
