# -*- coding: utf-8 -*-
import urllib.request, urllib.error, re, http.cookiejar

BASE = "https://www.lewx.cc"
SHUKU = BASE + "/shuku.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

def fetch(url, cookie=""):
    headers = {"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    try:
        data = op.open(req, timeout=30).read()
    except Exception as e:
        return ("ERR", str(e), "")
    return ("OK", len(data), data.decode("gbk", "ignore"))

# 1) 首请求
st, n, h = fetch(SHUKU, "")
print("[1] 首请求:", st, "bytes:", n)
print("    head:", h[:200].replace("\n"," "))

# 2) 还原 JS 跳转目标
m = re.search(r'window\.location\s*=\s*(.*?);', h, re.S)
if m:
    parts = re.findall(r'"([^"]*)"', m.group(1))
    target = "".join(parts)
    if not target.startswith("http"):
        target = BASE + ("" if target.startswith("/") else "/") + target
    print("[2] 还原跳转目标:", target)
    # 3) 跟随跳转（带上 cookiejar 自动收 session cookie）
    st2, n2, h2 = fetch(target, "")
    print("[3] 跟随跳转:", st2, "bytes:", n2)
    print("    head:", h2[:200].replace("\n"," "))
    mt = re.search(r'href="/shuku_0_0_0_(\d+)\.html"', h2)
    ml = re.search(r'href="/book/\d+/"', h2)
    print("    尾页页数标记:", bool(mt), (mt.group(1) if mt else ""))
    print("    书链接标记:", bool(ml))
    # 看 cookiejar 收到了什么
    print("    cookiejar:", [ (c.name, c.value[:20]) for c in cj ])
    # 4) 用拿到的 cookie 再请求首页（验证 session 是否生效）
    sent = "; ".join("%s=%s" % (c.name, c.value) for c in cj)
    st3, n3, h3 = fetch(SHUKU, sent)
    print("[4] 带 cookie 再请求首页:", st3, "bytes:", n3)
    mt3 = re.search(r'href="/shuku_0_0_0_(\d+)\.html"', h3)
    print("    尾页页数标记:", bool(mt3), (mt3.group(1) if mt3 else ""))
else:
    print("[2] 未匹配到 window.location 跳转")
