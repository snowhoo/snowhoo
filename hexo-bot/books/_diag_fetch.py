# -*- coding: utf-8 -*-
import urllib.request, re, sys

BASE = "https://www.lewx.cc"
SHUKU = BASE + "/shuku.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

def fetch(url, cookie=""):
    headers = {"User-Agent": UA, "Cookie": cookie,
               "Accept-Language": "zh-CN,zh;q=0.9"}
    req = urllib.request.Request(url, headers=headers)
    try:
        data = urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        return ("ERR", str(e), "")
    html = data.decode("gbk", "ignore")
    return ("OK", len(data), html)

print("=== 1) 无 cookie 请求书库首页 ===")
st, n, h = fetch(SHUKU, "")
print("status:", st, "bytes:", n)
head = h[:800] if isinstance(h, str) else ""
print("--- head(800) ---")
print(head)
print("--- 关键信号 ---")
print("ckc.js in [:600]:", "ckc.js" in (h[:600] if isinstance(h,str) else ""))
print("<title>Loading</title>:", "<title>Loading</title>" in (h if isinstance(h,str) else ""))
print("__K redirect:", ("window.location" in (h if isinstance(h,str) else "")) and ("__K=" in (h if isinstance(h,str) else "")))
m = re.search(r'data-param1="([^"]+)"', h) if isinstance(h,str) else None
print("data-param1 found:", bool(m), (m.group(1) if m else ""))
mt = re.search(r'href="/shuku_0_0_0_(\d+)\.html"', h) if isinstance(h,str) else None
print("尾页页数标记 found:", bool(mt))

if m:
    cookie = "%s=1" % m.group(1)
    print("\n=== 2) 带 cookie=%s 重试 ===" % cookie)
    st2, n2, h2 = fetch(SHUKU, cookie)
    print("status:", st2, "bytes:", n2)
    head2 = h2[:800] if isinstance(h2, str) else ""
    print("--- head(800) ---")
    print(head2)
    print("ckc.js in [:600]:", "ckc.js" in (h2[:600] if isinstance(h2,str) else ""))
    print("<title>Loading</title>:", "<title>Loading</title>" in (h2 if isinstance(h2,str) else ""))
    mt2 = re.search(r'href="/shuku_0_0_0_(\d+)\.html"', h2) if isinstance(h2,str) else None
    print("尾页页数标记 found:", bool(mt2), (mt2.group(1) if mt2 else ""))
else:
    print("\n(无 data-param1，无法构造 cookie 重试)")
