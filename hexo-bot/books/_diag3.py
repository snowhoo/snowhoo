# -*- coding: utf-8 -*-
import importlib.util, re, os

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lewx.cc.books.py")
spec = importlib.util.spec_from_file_location("lewxbooks", PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

print("COOKIE before:", repr(mod.COOKIE))
first = mod.warm_up()
print("warm_up len:", len(first))
print("is_bot_page:", mod.is_bot_page(first))
print("COOKIE after :", repr(mod.COOKIE))
total = mod.get_total_pages(first)
print("书库总页数:", total)
# 解析首页书链接数量
books0 = mod.parse_shuku_page(first)
print("首页解析到书:", len(books0))
if books0:
    print("样例:", books0[0]["id"], books0[0]["title"], books0[0]["author"])
# 抽一本详情页验证 cookie 复用后能否拿到章节
if books0:
    bid = books0[0]["id"]
    h = mod.fetch_html(mod.book_url_of(bid), referer=mod.SHUKU_URL)
    d = mod.parse_book_detail(h, bid) if h else None
    print("详情页章节数:", len(d["chapters"]) if d else "None", "标题:", (d["title"] if d else ""))
print("DONE")
