#!/usr/bin/env python3
"""为 AdSense ads.txt 在 apex 域名添加 301 跳转到 www 的 Cloudflare 重定向规则。

问题背景：
  Vercel 把 apex (dognav.org) 自动 308 跳到 www，AdSense 爬虫在 apex 抓 /ads.txt
  时拿到 308，有时判定为"找不到 ads.txt"，后台显示 Not found。此脚本在 Cloudflare
  侧加一条 301 规则，让 apex 的 /ads.txt 直接跳到 www，爬虫跟随更稳。

前置条件：
  1. Cloudflare API Token（权限：Zone → Rulesets:Edit），设为环境变量 CF_API_TOKEN
  2. Zone ID（Cloudflare 控制台 Zone Overview 页右下角），设为环境变量 CF_ZONE_ID

运行（PowerShell / bash 均可）：
  $env:CF_API_TOKEN="xxxx"; $env:CF_ZONE_ID="yyyy"; python cloudflare_ads_txt_redirect.py
  # 或 bash:
  CF_API_TOKEN=xxxx CF_ZONE_ID=yyyy python3 cloudflare_ads_txt_redirect.py
"""
import os
import sys
import json
import urllib.request

CF_API_TOKEN = os.environ.get("CF_API_TOKEN")
CF_ZONE_ID = os.environ.get("CF_ZONE_ID")

if not CF_API_TOKEN or not CF_ZONE_ID:
    sys.exit("请先设置环境变量 CF_API_TOKEN 与 CF_ZONE_ID（见文件顶部说明）")

API = "https://api.cloudflare.com/client/v4"

# 可改：如果你的 apex 不是 dognav.org，改这里三处
APEX_HOST = "dognav.org"
WWW_TARGET = "https://www.dognav.org/ads.txt"


def cf_call(method, path, data=None):
    url = API + path
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", "Bearer " + CF_API_TOKEN)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        sys.exit(f"Cloudflare API 错误 {e.code}: {detail}")


def main():
    # 1) 定位 dynamic_redirect 阶段的 ruleset（没有则创建）
    rulesets = cf_call("GET", f"/zones/{CF_ZONE_ID}/rulesets?phase=http_request_dynamic_redirect").get("result", [])
    rs = next((r for r in rulesets if r.get("phase") == "http_request_dynamic_redirect"), None)
    if not rs:
        print("未找到 http_request_dynamic_redirect ruleset，正在创建...")
        rs = cf_call("POST", f"/zones/{CF_ZONE_ID}/rulesets", {
            "name": "Redirect Rules",
            "description": "zone-level redirects",
            "kind": "zone",
            "phase": "http_request_dynamic_redirect",
        })["result"]
    ruleset_id = rs["id"]
    print("使用 ruleset:", ruleset_id)

    # 2) 添加 ads.txt apex -> www 的 301 重定向规则
    rule = {
        "action": "redirect",
        "expression": f'(http.host eq "{APEX_HOST}" and http.request.uri.path eq "/ads.txt")',
        "description": "ads.txt apex to www (301)",
        "status": "enabled",
        "redirect": {
            "target_url": WWW_TARGET,
            "status_code": 301,
            "preserve_query_string": True,
        },
    }
    resp = cf_call("POST", f"/zones/{CF_ZONE_ID}/rulesets/{ruleset_id}/rules", rule)
    if resp.get("success"):
        print(f"✅ 规则已添加：{APEX_HOST}/ads.txt -> 301 -> {WWW_TARGET}")
        print("   等 1-2 分钟生效，然后回 AdSense 后台点 'Request review' 触发重新检测。")
    else:
        print("❌ 失败:", resp.get("errors"))
        sys.exit(1)


if __name__ == "__main__":
    main()
