"""Разбирает тело issue (env ISSUE_BODY) → work/request.json + work/prompt.md, скачивает исходник в work/source.*"""
import json, os, re, subprocess, urllib.parse, urllib.request
from pathlib import Path

body = os.environ["ISSUE_BODY"]
work = Path("work"); work.mkdir(exist_ok=True); Path("out").mkdir(exist_ok=True)

req = json.loads(re.search(r"<!-- request-json -->\s*```json\s*(.+?)\s*```", body, re.S).group(1))
prompt = re.search(r"```text\n(.+?)\n```", body, re.S).group(1)
(work / "request.json").write_text(json.dumps(req, ensure_ascii=False, indent=2), encoding="utf-8")
(work / "prompt.md").write_text(prompt, encoding="utf-8")

src = req["source"]
ext = Path(src.get("name") or "x.mp4").suffix or ".mp4"
dst = work / f"source{ext}"
if src["kind"] == "link":
    pk = urllib.parse.quote(src["url"], safe="")
    with urllib.request.urlopen(f"https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key={pk}") as r:
        href = json.load(r)["href"]
    urllib.request.urlretrieve(href, dst)
elif src["kind"] == "file":
    subprocess.run(["aws", "s3", "cp", f"s3://{os.environ['R2_BUCKET']}/{src['upload']}", str(dst), *os.environ["R2"].split()], check=True)
else:
    dst = Path("assets/demo/demo_screen.mp4")
print("source:", dst, dst.stat().st_size, "bytes")
